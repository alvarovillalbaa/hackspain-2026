"""Leakage-safe point-in-time ledgers for companies and consolidated groups."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

LIQUID_PRODUCT_TYPES = {"checking", "saving", "wallet", "tpv"}
NON_OPERATING_CATEGORIES = {
    "transfer",
    "cash_settlement",
    "cash_settlements",
    "investment_deployment",
    "investment_return",
    "debt_repayment",
    "interest_charge",
}


@dataclass(frozen=True)
class Coverage:
    transactions: bool
    reconstructable_balance: bool
    invoices: bool
    debt_schedule: bool
    history_days: int
    partial_month: bool


@dataclass
class LedgerSnapshot:
    entity_id: str
    entity_type: Literal["company", "group"]
    as_of: pd.Timestamp
    company_ids: tuple[str, ...]
    transactions: pd.DataFrame
    invoices: pd.DataFrame
    balances: pd.DataFrame
    commitments: pd.DataFrame
    coverage: Coverage
    max_source_timestamp: pd.Timestamp
    audit: dict[str, int | float | str | bool] = field(default_factory=dict)

    @property
    def liquid_balance(self) -> float | None:
        values = pd.to_numeric(self.balances.get("balance_as_of"), errors="coerce")
        return None if values.notna().sum() == 0 else float(values.sum(min_count=1))


class Ledger:
    """Repository and point-in-time ledger builder.

    ``data_dir`` may be either the normalized Parquet cache or the original CSV directory.
    CSV mode is useful for tests; production commands should first run ``xray-cache``.
    """

    def __init__(self, data_dir: str | Path = "artifacts/cache") -> None:
        self.data_dir = Path(data_dir)

    def _read(self, name: str, columns: list[str] | None = None) -> pd.DataFrame:
        parquet = self.data_dir / f"{name}.parquet"
        csv = self.data_dir / f"{name}.csv"
        if parquet.exists():
            return pd.read_parquet(parquet, columns=columns)
        if csv.exists():
            frame = pd.read_csv(csv, usecols=columns, low_memory=False)
            for column in (
                "date",
                "value_date",
                "created_at",
                "issuance_date",
                "due_date",
                "payment_date",
                "next_payment_date",
                "last_payment_date",
            ):
                if column in frame:
                    frame[column] = pd.to_datetime(frame[column], errors="coerce")
            return frame
        if name == "debt_schedule_config":
            return pd.DataFrame()
        raise FileNotFoundError(f"Neither {parquet} nor {csv} exists")

    @cached_property
    def companies(self) -> pd.DataFrame:
        return self._read("companies")

    @cached_property
    def banking_products(self) -> pd.DataFrame:
        return self._read("banking_products")

    @cached_property
    def debt_products(self) -> pd.DataFrame:
        return self._read("debt_products")

    @cached_property
    def balances(self) -> pd.DataFrame:
        return self._read("balances")

    @cached_property
    def transactions(self) -> pd.DataFrame:
        frame = self._read("transactions")
        if "amount_accounting" not in frame:
            rate = pd.to_numeric(frame["exchange_rate"], errors="coerce")
            frame["amount_accounting"] = pd.to_numeric(
                frame["amount"], errors="coerce"
            ) / rate.where(rate.gt(0))
        return frame

    @cached_property
    def invoices(self) -> pd.DataFrame:
        frame = self._read("invoices")
        if "amount_accounting" not in frame:
            rate = pd.to_numeric(frame["exchange_rate"], errors="coerce")
            same = frame["currency"].eq(frame["accounting_currency"])
            rate = rate.where(~same, 1.0)
            frame["amount_accounting"] = pd.to_numeric(
                frame["amount"], errors="coerce"
            ) / rate.where(rate.gt(0))
        if "date_plausible" not in frame:
            frame["date_plausible"] = frame["issuance_date"].notna() & (
                frame["due_date"].isna()
                | (frame["due_date"] >= frame["issuance_date"] - pd.Timedelta(days=31))
            )
        return frame

    @cached_property
    def debt_schedules(self) -> pd.DataFrame:
        return self._read("debt_schedule_config")

    def resolve_entity(self, entity_id: str) -> tuple[Literal["company", "group"], tuple[str, ...]]:
        if entity_id in set(self.companies["company_id"]):
            return "company", (entity_id,)
        company_ids = tuple(
            sorted(
                self.companies.loc[self.companies["group_id"].eq(entity_id), "company_id"].tolist()
            )
        )
        if company_ids:
            return "group", company_ids
        raise KeyError(f"Unknown entity_id: {entity_id}")

    def _transactions_as_of(
        self, company_ids: tuple[str, ...], as_of: pd.Timestamp
    ) -> pd.DataFrame:
        tx = self.transactions
        result = tx.loc[
            tx["company_id"].isin(company_ids)
            & pd.to_datetime(tx["date"]).le(as_of)
            & tx["status"].fillna("").str.lower().eq("booked")
        ].copy()
        result["date"] = pd.to_datetime(result["date"])
        result["category"] = result["category"].fillna("-").str.lower()
        result["is_operating"] = ~result["category"].isin(NON_OPERATING_CATEGORIES)
        result["transfer_classification"] = np.where(
            result["category"].isin({"transfer", "cash_settlement", "cash_settlements"}),
            "unclassified_transfer",
            "not_transfer",
        )
        # Exact mirrored movements within the entity are high-confidence internal transfers.
        candidates = result.loc[result["category"].eq("transfer")].copy()
        candidates["abs_amount"] = candidates["amount_accounting"].abs().round(2)
        candidates["day"] = candidates["date"].dt.floor("D")
        grouped = candidates.groupby(["day", "abs_amount"], dropna=False)
        for _, group in grouped:
            if group["amount_accounting"].gt(0).any() and group["amount_accounting"].lt(0).any():
                result.loc[group.index, "transfer_classification"] = "mirrored_internal"
        return result.sort_values(["date", "transaction_id"]).reset_index(drop=True)

    def _balances_as_of(
        self, company_ids: tuple[str, ...], as_of: pd.Timestamp, tx: pd.DataFrame
    ) -> pd.DataFrame:
        products = self.banking_products.loc[
            self.banking_products["company_id"].isin(company_ids)
            & self.banking_products["type"].astype(str).str.lower().isin(LIQUID_PRODUCT_TYPES)
        ].copy()
        snapshots = self.balances.loc[
            self.balances["product_id"].isin(products["product_id"])
        ].copy()
        if snapshots.empty:
            return products.assign(balance_as_of=np.nan, reconstructable=False)
        snapshots["date"] = pd.to_datetime(snapshots["date"])
        # A balance observation is usable only once it has actually been recorded. Backward
        # reconstruction from a later extraction would make an earlier score change when a
        # future transaction changes, violating the point-in-time contract.
        latest = (
            snapshots.loc[snapshots["date"].le(as_of)]
            .sort_values("date")
            .drop_duplicates("product_id", keep="last")
        )
        result = products.merge(
            latest[["product_id", "date", "balance"]], on="product_id", how="left"
        )
        created = pd.to_datetime(result["created_at"], errors="coerce")
        result["reconstructable"] = (
            result["balance"].notna()
            & result["date"].le(as_of)
            & (created.isna() | created.le(as_of))
        )
        if result["date"].notna().any():
            movements = tx[["product_id", "date", "amount_accounting"]].merge(
                result[["product_id", "date"]].rename(columns={"date": "balance_date"}),
                on="product_id",
                how="inner",
            )
            movements = movements.loc[movements["date"].gt(movements["balance_date"])]
        else:
            movements = tx.iloc[0:0]
        movement_sum = movements.groupby("product_id")["amount_accounting"].sum()
        result["balance_as_of"] = result["balance"] + result["product_id"].map(movement_sum).fillna(
            0.0
        )
        result.loc[~result["reconstructable"], "balance_as_of"] = np.nan
        return result

    def _invoices_as_of(self, company_ids: tuple[str, ...], as_of: pd.Timestamp) -> pd.DataFrame:
        inv = self.invoices
        document_is_invoice = (
            inv["document_type"].isin({"invoice", "invoiceGroup"})
            if "document_type" in inv
            else pd.Series(True, index=inv.index)
        )
        result = inv.loc[
            inv["company_id"].isin(company_ids)
            & pd.to_datetime(inv["issuance_date"]).le(as_of)
            & inv["date_plausible"].fillna(False)
            & document_is_invoice
        ].copy()
        result["issuance_date"] = pd.to_datetime(result["issuance_date"])
        result["due_date"] = pd.to_datetime(result["due_date"])
        result["payment_date"] = pd.to_datetime(result["payment_date"])
        result["paid_as_of"] = result["payment_date"].notna() & result["payment_date"].le(as_of)
        result["open_as_of"] = ~result["paid_as_of"]
        result["direction"] = np.where(result["amount_accounting"].ge(0), "receivable", "payable")
        result["open_amount_as_of"] = np.where(
            result["open_as_of"], result["amount_accounting"].abs(), 0.0
        )
        result["days_overdue_as_of"] = (
            as_of - result["due_date"].where(result["due_date"].notna(), result["issuance_date"])
        ).dt.days.clip(lower=0)
        result["invoice_age_days"] = (as_of - result["issuance_date"]).dt.days.clip(lower=0)
        result["collection_delay_days"] = (
            result["payment_date"].where(result["paid_as_of"], as_of) - result["due_date"]
        ).dt.days
        return result.sort_values(["issuance_date", "operation_id"]).reset_index(drop=True)

    def _group_currency_factors(
        self, company_ids: tuple[str, ...], as_of: pd.Timestamp
    ) -> tuple[str, dict[str, float]]:
        companies = self.companies.loc[
            self.companies["company_id"].isin(company_ids), ["company_id", "currency"]
        ].copy()
        reporting_currency = str(companies["currency"].dropna().mode().iloc[0])
        invoice_rates = self.invoices.loc[
            pd.to_datetime(self.invoices["issuance_date"]).le(as_of)
            & pd.to_numeric(self.invoices["exchange_rate"], errors="coerce").gt(0)
        ].sort_values("issuance_date")
        factors: dict[str, float] = {}
        for row in companies.itertuples(index=False):
            currency = str(row.currency)
            if currency == reporting_currency:
                factors[row.company_id] = 1.0
                continue
            direct = invoice_rates.loc[
                invoice_rates["currency"].eq(currency)
                & invoice_rates["accounting_currency"].eq(reporting_currency),
                "exchange_rate",
            ]
            inverse = invoice_rates.loc[
                invoice_rates["currency"].eq(reporting_currency)
                & invoice_rates["accounting_currency"].eq(currency),
                "exchange_rate",
            ]
            if not direct.empty:
                factors[row.company_id] = 1.0 / float(direct.tail(100).median())
            elif not inverse.empty:
                factors[row.company_id] = float(inverse.tail(100).median())
            else:
                factors[row.company_id] = np.nan
        return reporting_currency, factors

    def snapshot(self, entity_id: str, as_of: str | pd.Timestamp) -> LedgerSnapshot:
        cutoff = pd.Timestamp(as_of).tz_localize(None)
        if isinstance(as_of, str) and len(as_of) <= 10:
            cutoff = cutoff + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
        entity_type, company_ids = self.resolve_entity(entity_id)
        tx = self._transactions_as_of(company_ids, cutoff)
        balances = self._balances_as_of(company_ids, cutoff, tx)
        invoices = self._invoices_as_of(company_ids, cutoff)
        reporting_currency = str(
            self.companies.loc[self.companies["company_id"].isin(company_ids), "currency"]
            .dropna()
            .mode()
            .iloc[0]
        )
        unconverted_companies = 0
        if entity_type == "group":
            reporting_currency, factors = self._group_currency_factors(company_ids, cutoff)
            tx_factor = tx["company_id"].map(factors)
            tx["amount_accounting"] = tx["amount_accounting"] * tx_factor
            balance_factor = balances["company_id"].map(factors)
            balances["balance_as_of"] = balances["balance_as_of"] * balance_factor
            invoice_factor = invoices["company_id"].map(factors)
            invoices["amount_accounting"] = invoices["amount_accounting"] * invoice_factor
            invoices["open_amount_as_of"] = invoices["open_amount_as_of"] * invoice_factor
            unconverted_companies = int(sum(not np.isfinite(value) for value in factors.values()))
        commitments = invoices.loc[invoices["open_as_of"]].copy()
        schedule = self.debt_schedules
        if not schedule.empty:
            last_payment = pd.to_datetime(schedule["last_payment_date"], errors="coerce")
            schedule_available = bool(
                (schedule["company_id"].isin(company_ids) & last_payment.le(cutoff)).any()
            )
        else:
            schedule_available = False
        history_days = 0 if tx.empty else max(0, int((cutoff - tx["date"].min()).days))
        partial_month = cutoff < cutoff.to_period("M").end_time
        coverage = Coverage(
            transactions=not tx.empty,
            reconstructable_balance=bool(balances["reconstructable"].any())
            if not balances.empty
            else False,
            invoices=not invoices.empty
            or bool(
                self.companies.loc[self.companies["company_id"].isin(company_ids), "erp"]
                .notna()
                .any()
            ),
            debt_schedule=schedule_available,
            history_days=history_days,
            partial_month=partial_month,
        )
        timestamps: list[pd.Timestamp] = []
        if not tx.empty:
            timestamps.append(tx["date"].max())
        if not invoices.empty:
            timestamps.append(invoices["issuance_date"].max())
            paid = invoices.loc[invoices["paid_as_of"], "payment_date"]
            if not paid.empty:
                timestamps.append(paid.max())
        if not balances.empty and balances["date"].notna().any():
            timestamps.append(balances["date"].max())
        max_source = max(
            (pd.Timestamp(value) for value in timestamps if pd.notna(value)), default=cutoff
        )
        max_source = min(max_source, cutoff)
        return LedgerSnapshot(
            entity_id=entity_id,
            entity_type=entity_type,
            as_of=cutoff,
            company_ids=company_ids,
            transactions=tx,
            invoices=invoices,
            balances=balances,
            commitments=commitments,
            coverage=coverage,
            max_source_timestamp=max_source,
            audit={
                "booked_transactions": len(tx),
                "invoices_known": len(invoices),
                "open_invoices": len(commitments),
                "reconstructable_products": int(balances["reconstructable"].sum())
                if not balances.empty
                else 0,
                "excluded_transfers": int((tx["transfer_classification"] != "not_transfer").sum())
                if not tx.empty
                else 0,
                "reporting_currency": reporting_currency,
                "unconverted_companies": unconverted_companies,
            },
        )
