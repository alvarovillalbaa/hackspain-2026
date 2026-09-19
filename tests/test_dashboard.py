from __future__ import annotations

from datetime import time

from xray.dashboard import build_dashboard_payload, entity_catalog, interval_dates
from xray.ledger import Ledger


def test_interval_dates_are_regular_and_use_end_of_day():
    dates = interval_dates("2024-07-15", "monthly", 3)
    assert [date.date().isoformat() for date in dates] == [
        "2024-05-31",
        "2024-06-30",
        "2024-07-15",
    ]
    assert all(date.time() == time(23, 59, 59, 999999) for date in dates)


def test_dashboard_payload_reconciles_history_and_forecast(mini_cache):
    ledger = Ledger(mini_cache, reconstruct_balances=True)
    payload = build_dashboard_payload(
        ledger,
        "C1",
        "2024-07-31",
        periods=3,
        horizons=(30,),
    )
    assert payload["entity"]["entity_type"] == "company"
    assert len(payload["history"]) == 3
    assert payload["history"][-1]["score"] == payload["current"]["score"]
    assert set(payload["forecast"]["horizons"]) == {"30"}
    assert payload["history"][-1]["point_ledger_sum"] == payload["history"][-1]["score"]


def test_entity_catalog_includes_companies_and_groups(mini_cache):
    catalog = entity_catalog(Ledger(mini_cache))
    assert {item["entity_id"] for item in catalog} == {"C1", "C2", "G1"}
