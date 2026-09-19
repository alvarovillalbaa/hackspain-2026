"""Dashboard-facing aggregation over scores, explanations, and forecasts."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict

import pandas as pd

from .calibration import CalibrationArtifact
from .forecast import BaselineForecaster
from .ledger import Ledger
from .score import score_entity

INTERVALS = {"weekly", "monthly", "quarterly"}


def latest_data_date(ledger: Ledger) -> str:
    latest = pd.to_datetime(ledger.transactions["date"], errors="coerce").max()
    if pd.isna(latest):
        raise ValueError("No transaction dates are available")
    return pd.Timestamp(latest).date().isoformat()


def entity_catalog(ledger: Ledger) -> list[dict[str, object]]:
    companies = ledger.companies.copy()
    rows = [
        {
            "entity_id": str(row.company_id),
            "entity_type": "company",
            "group_id": None if pd.isna(row.group_id) else str(row.group_id),
            "country": (
                None
                if pd.isna(getattr(row, "country", None))
                else str(getattr(row, "country"))
            ),
            "currency": None if pd.isna(row.currency) else str(row.currency),
        }
        for row in companies.itertuples(index=False)
    ]
    for group_id, members in companies.groupby("group_id", dropna=True):
        currency = members["currency"].dropna().mode()
        rows.append(
            {
                "entity_id": str(group_id),
                "entity_type": "group",
                "group_id": str(group_id),
                "country": None,
                "currency": str(currency.iloc[0]) if not currency.empty else None,
                "company_count": len(members),
            }
        )
    return sorted(rows, key=lambda row: (row["entity_type"] != "company", row["entity_id"]))


def interval_dates(as_of: str | pd.Timestamp, interval: str, periods: int) -> list[pd.Timestamp]:
    if interval not in INTERVALS:
        raise ValueError(f"interval must be one of {sorted(INTERVALS)}")
    if periods < 2:
        raise ValueError("periods must be at least 2")
    end = pd.Timestamp(as_of).normalize() + pd.Timedelta(days=1) - pd.Timedelta(microseconds=1)
    if interval == "weekly":
        dates = [end - pd.Timedelta(weeks=index) for index in range(periods)]
    else:
        months = 1 if interval == "monthly" else 3
        dates = [end]
        cursor = end.to_period("M").start_time
        for index in range(1, periods):
            date = (cursor - pd.DateOffset(months=months * index)).to_period("M").end_time
            dates.append(date)
    return sorted(set(dates))


def _history_entry(scored) -> dict[str, object]:
    result = scored.result.to_dict()
    result["coverage"] = asdict(scored.snapshot.coverage)
    result["audit"] = scored.snapshot.audit
    result["features"] = scored.panel.to_dict()["features"]
    return result


def build_dashboard_payload(
    ledger: Ledger,
    entity_id: str,
    as_of: str | pd.Timestamp,
    *,
    interval: str = "monthly",
    periods: int = 12,
    calibration: CalibrationArtifact | None = None,
    horizons: Iterable[int] = (30, 90, 180),
) -> dict[str, object]:
    """Build one coherent dashboard payload for an entity and reporting date."""

    entity_type, company_ids = ledger.resolve_entity(entity_id)
    scored_history = [
        score_entity(ledger, entity_id, date)
        for date in interval_dates(as_of, interval, periods)
    ]
    current = scored_history[-1]
    horizon_values = tuple(sorted({int(value) for value in horizons if int(value) > 0}))
    forecast_days = max(horizon_values, default=180)
    forecast = BaselineForecaster(ledger).forecast(
        entity_id,
        as_of,
        horizon_days=forecast_days,
        score_horizons=horizon_values,
    )
    if calibration is not None:
        forecast = calibration.apply(
            forecast,
            current_score=current.result.score,
            entity_type=entity_type,
        )
    company_rows = ledger.companies.loc[ledger.companies["company_id"].isin(company_ids)]
    currency = company_rows["currency"].dropna().mode()
    country = (
        company_rows["country"].dropna().mode()
        if "country" in company_rows
        else pd.Series(dtype=str)
    )
    return {
        "schema_version": "xray-dashboard-v1.0",
        "entity": {
            "entity_id": entity_id,
            "entity_type": entity_type,
            "company_count": len(company_ids),
            "group_id": (
                str(company_rows.iloc[0]["group_id"])
                if entity_type == "company" and pd.notna(company_rows.iloc[0]["group_id"])
                else (entity_id if entity_type == "group" else None)
            ),
            "country": str(country.iloc[0]) if not country.empty else None,
            "currency": str(currency.iloc[0]) if not currency.empty else None,
        },
        "as_of": current.result.as_of,
        "interval": interval,
        "periods": periods,
        "history": [_history_entry(item) for item in scored_history],
        "current": current.result.to_dict(),
        "explanation": current.explanation,
        "forecast": forecast.to_dict(include_weekly=True),
        "methodology": {
            "score_version": current.result.score_version,
            "forecast_model": forecast.model_version,
            "calibration_status": forecast.calibration_status,
            "historical_balance_method": (
                "single_anchor_backward_when_needed"
                if any(
                    item.snapshot.audit.get("backward_reconstructed_products", 0)
                    for item in scored_history
                )
                else "observed_anchors"
            ),
        },
    }
