"""Tests for xray.demopacks — mutation helpers and pack shape."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from xray.demopacks import (
    GROUP_COMPANIES,
    GROUP_ID,
    UPDATE_COMPANY,
    append_stress_month,
)
from xray import features

RAW = Path(__file__).resolve().parents[1] / "docs" / "data" / "raw"
HAS_RAW = (RAW / "companies.csv").exists()
NEW = RAW / "new"


def _tiny_tables() -> dict[str, pd.DataFrame]:
    """Minimal scorable company for mutation unit tests (no full Embat dump)."""
    cid = "COMP_TINY"
    chk = "CHK_TINY"
    return {
        "groups": pd.DataFrame([{"group_id": "G1", "erp": None, "n_companies_in_sample": 1}]),
        "companies": pd.DataFrame([{
            "company_id": cid, "group_id": "G1", "country": "ES",
            "currency": "EUR", "erp": None, "created_at": pd.Timestamp("2025-01-01"),
        }]),
        "banking_products": pd.DataFrame([{
            "product_id": chk, "company_id": cid, "label": "CHK", "type": "checking",
            "bank_name": "BBVA", "service": "accounts", "currency": "EUR",
            "created_at": pd.Timestamp("2025-01-01"),
        }]),
        "debt_products": pd.DataFrame(columns=[
            "product_id", "company_id", "label", "type", "bank_name", "service",
            "currency", "created_at", "granted", "outstanding", "liquidity",
        ]),
        "debt_schedule_config": pd.DataFrame(columns=[
            "product_id", "company_id", "settlement_product_id", "amortization_type",
            "interest_calc_method", "amortising_frequency", "interest_type",
            "granted_balance", "outstanding_balance", "total_periods",
            "next_payment_date", "last_payment_date", "annual_interest_rate_or_spread",
        ]),
        "transactions": pd.DataFrame([
            {
                "transaction_id": "t1", "company_id": cid, "product_id": chk,
                "date": pd.Timestamp("2026-07-15"), "value_date": pd.Timestamp("2026-07-15"),
                "amount": 50_000.0, "exchange_rate": 1.0, "status": "booked",
                "accounting_status": "reconciled", "category": "collection",
                "description": "in", "counterparty_id": "C1",
            },
            {
                "transaction_id": "t2", "company_id": cid, "product_id": chk,
                "date": pd.Timestamp("2026-08-10"), "value_date": pd.Timestamp("2026-08-10"),
                "amount": -20_000.0, "exchange_rate": 1.0, "status": "booked",
                "accounting_status": "reconciled", "category": "payment",
                "description": "out", "counterparty_id": "C2",
            },
        ]),
        "invoices": pd.DataFrame([
            {
                "operation_id": "inv1", "company_id": cid, "document_type": "invoice",
                "issuance_date": pd.Timestamp("2026-07-01"),
                "due_date": pd.Timestamp("2026-07-31"),
                "payment_date": pd.Timestamp("2026-07-31"),
                "amount": -1_000.0, "pending_amount": 0.0,
                "currency": "EUR", "accounting_currency": "EUR", "exchange_rate": 1.0,
                "status": "paid", "concept": "old", "counterparty_id": "S1",
            },
        ]),
        "balances": pd.DataFrame([{
            "product_id": chk, "company_id": cid,
            "date": pd.Timestamp("2026-09-01"),
            "balance": 30_000.0, "available": None, "granted": None,
            "liquidity": None, "countable": None,
        }]),
    }


def test_append_stress_month_moves_photo_and_features_month():
    tables = _tiny_tables()
    mutated = append_stress_month(tables, company_id="COMP_TINY")
    bal_dates = mutated["balances"]["date"].unique()
    assert len(bal_dates) == 1
    assert pd.Timestamp(bal_dates[0]) == pd.Timestamp("2026-10-01")

    # New September txs present
    tx = mutated["transactions"]
    sep = tx[tx["date"] >= pd.Timestamp("2026-09-01")]
    assert len(sep) > 0
    assert (sep["transaction_id"].astype(str).str.startswith("DEMO_TX_")).any()

    feats = features.build(tables=mutated)
    assert feats["month"].max() == "2026-09"


@pytest.mark.skipif(not (NEW / "group" / "companies.csv").exists(), reason="demo pack not generated")
def test_group_pack_shape():
    companies = pd.read_csv(NEW / "group" / "companies.csv")
    assert set(companies["company_id"].astype(str)) == set(GROUP_COMPANIES)
    assert set(companies["group_id"].astype(str)) == {GROUP_ID}

    bank = pd.read_csv(NEW / "group" / "banking_products.csv")
    bal = pd.read_csv(NEW / "group" / "balances.csv")
    tx = pd.read_csv(NEW / "group" / "transactions.csv")
    chk = set(bank.loc[bank["type"] == "checking", "product_id"].astype(str))
    with_bal = set(bal.loc[bal["product_id"].astype(str).isin(chk) & bal["balance"].notna(), "company_id"].astype(str))
    with_tx = set(tx["company_id"].astype(str).unique())
    assert set(GROUP_COMPANIES).issubset(with_bal & with_tx)


@pytest.mark.skipif(not (NEW / "update" / "expected.json").exists(), reason="demo pack not generated")
def test_update_pack_expected_differs_from_baseline():
    import json
    meta = json.loads((NEW / "update" / "expected.json").read_text(encoding="utf-8"))
    exp = meta["expected"][UPDATE_COMPANY]
    assert exp["month"] == "2026-09"
    assert exp["score"] is not None
    assert float(exp["score"]) != 59.9
    assert meta["baseline"]["score"] == 59.9
