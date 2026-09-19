"""Observed, point-in-time financial features."""

from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from .ledger import Ledger, LedgerSnapshot

RECURRING_CATEGORIES = {"salary", "tax", "social_security", "utility", "fee"}
COLLECTION_CATEGORIES = {"collection", "bulk_collection", "pos_settlement"}
DEBT_CATEGORIES = {"debt_repayment", "interest_charge"}


@dataclass(frozen=True)
class FeatureValue:
    name: str
    value: float | None
    window_days: int
    coverage: float
    reliability: float
    max_source_timestamp: str
    evidence_count: int = 0
    unit: str = "ratio"

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class FeaturePanel:
    entity_id: str
    as_of: str
    features: dict[str, FeatureValue]
    coverage_flags: dict[str, bool | int]
    max_source_timestamp: str

    def __post_init__(self) -> None:
        cutoff = pd.Timestamp(self.as_of)
        if pd.Timestamp(self.max_source_timestamp) > cutoff:
            raise ValueError("feature panel contains information recorded after as_of")
        for feature in self.features.values():
            if pd.Timestamp(feature.max_source_timestamp) > cutoff:
                raise ValueError(f"{feature.name} contains information recorded after as_of")

    def values(self) -> dict[str, float | None]:
        return {name: feature.value for name, feature in self.features.items()}

    def to_dict(self) -> dict[str, object]:
        return {
            "entity_id": self.entity_id,
            "as_of": self.as_of,
            "features": {name: value.to_dict() for name, value in self.features.items()},
            "coverage_flags": self.coverage_flags,
            "max_source_timestamp": self.max_source_timestamp,
        }


def _finite(value: float | np.floating | None) -> float | None:
    if value is None or not np.isfinite(value):
        return None
    return float(value)


def _weighted_mean(values: pd.Series, weights: pd.Series) -> float | None:
    valid = values.notna() & weights.notna() & weights.gt(0)
    if not valid.any():
        return None
    return _finite(np.average(values.loc[valid], weights=weights.loc[valid]))


def _window(snapshot: LedgerSnapshot, days: int) -> pd.DataFrame:
    start = snapshot.as_of - pd.Timedelta(days=days) + pd.Timedelta(microseconds=1)
    return snapshot.transactions.loc[snapshot.transactions["date"].gt(start)].copy()


def _complete_month_cashflows(snapshot: LedgerSnapshot, days: int) -> pd.Series:
    tx = _window(snapshot, days)
    if tx.empty:
        return pd.Series(dtype=float)
    tx = tx.loc[tx["is_operating"]].copy()
    tx["month"] = tx["date"].dt.to_period("M")
    current_month = snapshot.as_of.to_period("M")
    tx = tx.loc[tx["month"].lt(current_month)]
    return tx.groupby("month")["amount_accounting"].sum().sort_index()


def calculate_features(snapshot: LedgerSnapshot, window_days: int = 180) -> FeaturePanel:
    """Calculate the scorecard's compact feature set from a point-in-time snapshot."""

    tx = _window(snapshot, window_days)
    operating = tx.loc[tx["is_operating"]].copy()
    inflows = operating.loc[operating["amount_accounting"].gt(0), "amount_accounting"]
    outflows = -operating.loc[operating["amount_accounting"].lt(0), "amount_accounting"]
    history_coverage = min(1.0, snapshot.coverage.history_days / max(window_days, 1))
    tx_reliability = min(history_coverage, min(1.0, len(tx) / 30.0))
    balance_reliability = snapshot.coverage.balance_reliability
    source_ts = snapshot.max_source_timestamp.isoformat()
    result: dict[str, FeatureValue] = {}

    def add(
        name: str,
        value: float | None,
        *,
        reliability: float = tx_reliability,
        coverage: float = history_coverage,
        count: int = 0,
        unit: str = "ratio",
        days: int = window_days,
    ) -> None:
        result[name] = FeatureValue(
            name=name,
            value=_finite(value),
            window_days=days,
            coverage=float(np.clip(coverage, 0, 1)),
            reliability=float(np.clip(reliability, 0, 1)),
            max_source_timestamp=source_ts,
            evidence_count=int(count),
            unit=unit,
        )

    liquid_balance = snapshot.liquid_balance
    daily_outflows = float(outflows.sum() / window_days) if len(outflows) else 0.0
    runway = None
    if liquid_balance is not None:
        runway = 3650.0 if daily_outflows <= 0 else max(0.0, liquid_balance) / daily_outflows
    add(
        "cash_runway_days",
        runway,
        reliability=min(tx_reliability, balance_reliability),
        count=len(outflows),
        unit="days",
    )

    monthly = _complete_month_cashflows(snapshot, window_days)
    worst_deficit = abs(min(0.0, float(monthly.quantile(0.10)))) if not monthly.empty else 0.0
    deficit_coverage = None
    if liquid_balance is not None:
        deficit_coverage = 5.0 if worst_deficit <= 0 else max(0.0, liquid_balance) / worst_deficit
    add(
        "worst_deficit_cash_coverage",
        deficit_coverage,
        reliability=min(tx_reliability, balance_reliability),
        count=len(monthly),
        unit="multiple",
    )

    operating_inflow = float(inflows.sum())
    operating_net = operating_inflow - float(outflows.sum())
    margin = operating_net / operating_inflow if operating_inflow > 0 else None
    add("operating_cash_margin", margin, count=len(operating))
    positive_fraction = float(monthly.gt(0).mean()) if len(monthly) else None
    add(
        "positive_cashflow_month_fraction",
        positive_fraction,
        reliability=min(tx_reliability, len(monthly) / 3),
        count=len(monthly),
        unit="fraction",
    )

    recurring = operating.loc[operating["category"].isin(RECURRING_CATEGORIES)]
    recurring_outflow = float(
        -recurring.loc[recurring["amount_accounting"].lt(0), "amount_accounting"].sum()
    )
    recurring_coverage = (
        5.0
        if recurring_outflow <= 0 and operating_inflow > 0
        else (operating_inflow / recurring_outflow if recurring_outflow > 0 else None)
    )
    add("recurring_obligation_coverage", recurring_coverage, count=len(recurring), unit="multiple")

    inv = snapshot.invoices
    invoice_reliability = 0.0
    if snapshot.coverage.invoices:
        invoice_reliability = min(1.0, len(inv) / 20.0) * min(
            1.0, snapshot.coverage.history_days / 90
        )
    open_inv = inv.loc[inv["open_as_of"]] if not inv.empty else inv
    receivables = open_inv.loc[open_inv["direction"].eq("receivable")]
    payables = open_inv.loc[open_inv["direction"].eq("payable")]

    def overdue_ratio(frame: pd.DataFrame) -> float | None:
        total = frame["open_amount_as_of"].sum()
        if total <= 0:
            return None
        overdue = frame.loc[frame["days_overdue_as_of"].gt(0), "open_amount_as_of"].sum()
        return float(overdue / total)

    add(
        "overdue_receivables_ratio",
        overdue_ratio(receivables),
        reliability=invoice_reliability,
        coverage=float(snapshot.coverage.invoices),
        count=len(receivables),
        unit="fraction",
    )
    paid_receivables = inv.loc[inv["direction"].eq("receivable") & inv["paid_as_of"]]
    collection_delay = _weighted_mean(
        paid_receivables["collection_delay_days"].clip(lower=0),
        paid_receivables["amount_accounting"].abs(),
    )
    add(
        "customer_collection_delay_days",
        collection_delay,
        reliability=invoice_reliability,
        coverage=float(snapshot.coverage.invoices),
        count=len(paid_receivables),
        unit="days",
    )
    add(
        "overdue_payables_ratio",
        overdue_ratio(payables),
        reliability=invoice_reliability,
        coverage=float(snapshot.coverage.invoices),
        count=len(payables),
        unit="fraction",
    )
    paid_payables = inv.loc[inv["direction"].eq("payable") & inv["paid_as_of"]].copy()
    paid_payables["payment_month"] = paid_payables["payment_date"].dt.to_period("M")
    monthly_delay = (
        paid_payables.groupby("payment_month")["collection_delay_days"].median().sort_index()
    )
    supplier_delay_change = None
    if len(monthly_delay) >= 2:
        supplier_delay_change = float(monthly_delay.iloc[-1] - monthly_delay.iloc[-2])
    add(
        "supplier_payment_delay_change_days",
        supplier_delay_change,
        reliability=invoice_reliability * min(1.0, len(monthly_delay) / 2),
        coverage=float(snapshot.coverage.invoices),
        count=len(paid_payables),
        unit="days",
    )

    debt_service = tx.loc[tx["category"].isin(DEBT_CATEGORIES) & tx["amount_accounting"].lt(0)]
    repayment_interest = float(-debt_service["amount_accounting"].sum())
    cash_before_debt = operating_net
    debt_coverage = (
        5.0
        if repayment_interest <= 0 and cash_before_debt > 0
        else (cash_before_debt / repayment_interest if repayment_interest > 0 else None)
    )
    debt_reliability = tx_reliability * min(1.0, max(1, len(debt_service)) / 3)
    add(
        "debt_service_coverage",
        debt_coverage,
        reliability=debt_reliability,
        count=len(debt_service),
        unit="multiple",
    )
    interest = float(
        -tx.loc[
            tx["category"].eq("interest_charge") & tx["amount_accounting"].lt(0),
            "amount_accounting",
        ].sum()
    )
    interest_burden = interest / operating_inflow if operating_inflow > 0 else None
    add(
        "interest_burden",
        interest_burden,
        reliability=tx_reliability,
        count=int(tx["category"].eq("interest_charge").sum()),
    )

    collections = operating.loc[
        operating["amount_accounting"].gt(0) & operating["counterparty_id"].notna()
    ]
    by_counterparty = (
        collections.groupby("counterparty_id")["amount_accounting"]
        .sum()
        .sort_values(ascending=False)
    )
    concentration = (
        float(by_counterparty.head(3).sum() / by_counterparty.sum())
        if by_counterparty.sum() > 0
        else None
    )
    concentration_reliability = tx_reliability * min(1.0, len(by_counterparty) / 5)
    add(
        "top3_collection_concentration",
        concentration,
        reliability=concentration_reliability,
        count=len(by_counterparty),
        unit="fraction",
    )

    if operating.empty:
        downside_volatility = None
        rolling_count = 0
    else:
        daily = operating.set_index("date")["amount_accounting"].resample("D").sum()
        rolling = daily.rolling(30, min_periods=14).sum().dropna()
        downside = rolling.loc[rolling.lt(rolling.median())]
        scale = max(float(inflows.sum() / max(window_days, 1) * 30), 1.0)
        downside_volatility = float(downside.std(ddof=0) / scale) if len(downside) >= 2 else None
        rolling_count = len(rolling)
    add("downside_cashflow_volatility", downside_volatility, count=rolling_count)

    return FeaturePanel(
        entity_id=snapshot.entity_id,
        as_of=snapshot.as_of.isoformat(),
        features=result,
        coverage_flags={
            "transactions": snapshot.coverage.transactions,
            "reconstructable_balance": snapshot.coverage.reconstructable_balance,
            "balance_reliability": snapshot.coverage.balance_reliability,
            "invoices": snapshot.coverage.invoices,
            "debt_schedule": snapshot.coverage.debt_schedule,
            "history_days": snapshot.coverage.history_days,
            "partial_month": snapshot.coverage.partial_month,
        },
        max_source_timestamp=source_ts,
    )


def feature_panels(
    ledger: Ledger,
    entity_id: str,
    as_of_dates: Iterable[str | pd.Timestamp],
    window_days: int = 180,
) -> list[FeaturePanel]:
    return [
        calculate_features(ledger.snapshot(entity_id, date), window_days) for date in as_of_dates
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Calculate leakage-safe observed features")
    parser.add_argument("entity_id")
    parser.add_argument("--as-of", required=True)
    parser.add_argument("--data", default="artifacts/cache")
    parser.add_argument("--window-days", type=int, default=180, choices=(30, 90, 180, 365))
    args = parser.parse_args(argv)
    panel = calculate_features(
        Ledger(args.data).snapshot(args.entity_id, args.as_of), args.window_days
    )
    print(json.dumps(panel.to_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
