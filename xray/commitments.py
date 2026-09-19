"""Known invoice, debt, and recurring-payment commitments."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from .ledger import Ledger, LedgerSnapshot

RECURRING_CATEGORIES = {"salary", "tax", "social_security", "utility", "fee"}


@dataclass(frozen=True)
class CommitmentSchedule:
    entity_id: str
    as_of: str
    horizon_days: int
    rows: pd.DataFrame

    @property
    def total_inflows(self) -> float:
        return (
            float(self.rows.loc[self.rows["amount"].gt(0), "amount"].sum())
            if not self.rows.empty
            else 0.0
        )

    @property
    def total_outflows(self) -> float:
        return (
            float(-self.rows.loc[self.rows["amount"].lt(0), "amount"].sum())
            if not self.rows.empty
            else 0.0
        )


def _invoice_commitments(
    snapshot: LedgerSnapshot, horizon: pd.Timestamp
) -> list[dict[str, object]]:
    inv = snapshot.invoices
    if inv.empty:
        return []
    paid = inv.loc[inv["paid_as_of"]].copy()
    delays = (
        paid.groupby(["direction", "counterparty_id"], dropna=False)["collection_delay_days"]
        .median()
        .clip(lower=-15, upper=90)
    )
    direction_delays = (
        paid.groupby("direction")["collection_delay_days"].median().clip(lower=-15, upper=90)
    )
    rows = []
    for invoice in snapshot.commitments.itertuples(index=False):
        key = (invoice.direction, invoice.counterparty_id)
        delay = delays.get(key, direction_delays.get(invoice.direction, 0.0))
        delay = 0.0 if pd.isna(delay) else float(delay)
        due = invoice.due_date if pd.notna(invoice.due_date) else invoice.issuance_date
        expected = max(
            snapshot.as_of.normalize() + pd.Timedelta(days=1),
            pd.Timestamp(due) + pd.Timedelta(days=max(0, delay)),
        )
        if expected > horizon:
            continue
        sign = 1.0 if invoice.direction == "receivable" else -1.0
        rows.append(
            {
                "date": expected,
                "amount": sign * float(invoice.open_amount_as_of),
                "primitive": "operating_collections" if sign > 0 else "operating_payments",
                "source": "open_invoice",
                "source_id": invoice.operation_id,
                "counterparty_id": invoice.counterparty_id,
                "confidence": "known_timing_estimated",
            }
        )
    return rows


def _debt_commitments(
    ledger: Ledger, snapshot: LedgerSnapshot, horizon: pd.Timestamp
) -> list[dict[str, object]]:
    schedules = ledger.debt_schedules
    if schedules.empty:
        return []
    schedules = schedules.loc[schedules["company_id"].isin(snapshot.company_ids)].copy()
    for column in ("next_payment_date", "last_payment_date"):
        schedules[column] = pd.to_datetime(schedules[column], errors="coerce")
    # A schedule snapshot is not allowed into a historical forecast until its own last
    # observed payment was knowable at the cutoff.
    schedules = schedules.loc[
        schedules["next_payment_date"].notna() & schedules["last_payment_date"].le(snapshot.as_of)
    ]
    rows: list[dict[str, object]] = []
    for schedule in schedules.itertuples(index=False):
        frequency = str(schedule.amortising_frequency).lower()
        days = (
            365
            if "annual" in frequency
            else 182
            if "semi" in frequency
            else 91
            if "quarter" in frequency
            else 30
        )
        outstanding = (
            abs(float(schedule.outstanding_balance))
            if pd.notna(schedule.outstanding_balance)
            else 0.0
        )
        periods = max(int(schedule.total_periods), 1) if pd.notna(schedule.total_periods) else 12
        principal = outstanding / periods
        annual_rate = (
            max(0.0, float(schedule.annual_interest_rate_or_spread))
            if pd.notna(schedule.annual_interest_rate_or_spread)
            else 0.0
        )
        interest = outstanding * annual_rate * days / 365
        payment_date = pd.Timestamp(schedule.next_payment_date)
        while payment_date <= snapshot.as_of:
            payment_date += pd.Timedelta(days=days)
        while snapshot.as_of < payment_date <= horizon:
            if principal:
                rows.append(
                    {
                        "date": payment_date,
                        "amount": -principal,
                        "primitive": "debt_service",
                        "source": "formal_debt_schedule",
                        "source_id": schedule.product_id,
                        "counterparty_id": None,
                        "confidence": "known",
                    }
                )
            if interest:
                rows.append(
                    {
                        "date": payment_date,
                        "amount": -interest,
                        "primitive": "interest",
                        "source": "formal_debt_schedule",
                        "source_id": schedule.product_id,
                        "counterparty_id": None,
                        "confidence": "known",
                    }
                )
            payment_date += pd.Timedelta(days=days)
    return rows


def _recurring_commitments(
    snapshot: LedgerSnapshot, horizon: pd.Timestamp
) -> list[dict[str, object]]:
    tx = snapshot.transactions
    recent = tx.loc[
        tx["date"].gt(snapshot.as_of - pd.Timedelta(days=180))
        & tx["category"].isin(RECURRING_CATEGORIES)
        & tx["amount_accounting"].lt(0)
    ].copy()
    if recent.empty:
        return []
    recent["month"] = recent["date"].dt.to_period("M")
    monthly = recent.groupby(["category", "month"])["amount_accounting"].sum().reset_index()
    medians = monthly.groupby("category")["amount_accounting"].median()
    last_days = recent.assign(day=recent["date"].dt.day).groupby("category")["day"].median()
    rows: list[dict[str, object]] = []
    for category, amount in medians.items():
        month = (snapshot.as_of + pd.offsets.MonthBegin(1)).normalize()
        while month <= horizon:
            day = min(int(last_days.get(category, 15)), int((month + pd.offsets.MonthEnd(0)).day))
            date = month + pd.Timedelta(days=day - 1)
            if date <= horizon:
                rows.append(
                    {
                        "date": date,
                        "amount": float(amount),
                        "primitive": "recurring_fixed_outflows",
                        "source": "detected_recurring_pattern",
                        "source_id": str(category),
                        "counterparty_id": None,
                        "confidence": "pattern",
                    }
                )
            month += pd.offsets.MonthBegin(1)
    return rows


def build_commitments(
    ledger: Ledger, snapshot: LedgerSnapshot, horizon_days: int = 180
) -> CommitmentSchedule:
    horizon = snapshot.as_of + pd.Timedelta(days=horizon_days)
    rows = (
        _invoice_commitments(snapshot, horizon)
        + _debt_commitments(ledger, snapshot, horizon)
        + _recurring_commitments(snapshot, horizon)
    )
    columns = [
        "date",
        "amount",
        "primitive",
        "source",
        "source_id",
        "counterparty_id",
        "confidence",
    ]
    frame = pd.DataFrame(rows, columns=columns)
    if not frame.empty:
        frame["date"] = pd.to_datetime(frame["date"])
        frame = frame.sort_values(
            ["date", "primitive", "source_id"], na_position="last"
        ).reset_index(drop=True)
    return CommitmentSchedule(snapshot.entity_id, snapshot.as_of.isoformat(), horizon_days, frame)
