"""Tests de `features.build()` al seam (slice #2): dadas tablas mínimas como las de `xray.data.load()`,
la tabla del contrato que sale. Sin dataset; el humo sobre los datos reales se salta si no hay caché."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from xray import features
from xray.data import artifacts_dir

AS_OF = pd.Timestamp("2026-09-01")


def _ts(*days: str) -> pd.Series:
    return pd.to_datetime(list(days))


def _tables() -> dict[str, pd.DataFrame]:
    companies = pd.DataFrame({"company_id": ["A", "B", "C"], "group_id": ["G1", "G1", "G2"],
                              "currency": ["EUR", "EUR", "EUR"]})
    bank = pd.DataFrame({"product_id": ["CHK_A", "CHK_B", "CHK_C", "SAV_A"],
                         "company_id": ["A", "B", "C", "A"],
                         "type": ["checking", "checking", "checking", "saving"]})
    debt = pd.DataFrame({"product_id": [], "company_id": [], "type": [], "granted": []})
    tx = pd.DataFrame({
        "transaction_id": [f"t{i}" for i in range(1, 9)],
        "company_id": ["A", "A", "A", "A", "A", "B", "B", "C"],
        "product_id": ["CHK_A", "CHK_A", "CHK_A", "CHK_A", "CHK_A", "CHK_B", "CHK_B", "CHK_C"],
        "date": _ts("2026-05-10", "2026-06-05", "2026-07-15", "2026-08-20", "2026-09-01",
                    "2026-07-01", "2026-08-03", "2026-06-01"),
        "amount": [500.0, -300.0, 200.0, -100.0, 999.0, 100.0, -20.0, 10.0],
        "category": ["collection", "supplier", "collection", "debt_repayment", "collection",
                     "collection", "utility", "collection"],
        "status": ["booked"] * 8,
    })
    inv = pd.DataFrame({
        "operation_id": [f"i{i}" for i in range(1, 7)],
        "company_id": ["A"] * 6,
        "document_type": ["invoice", "invoice", "invoice", "paymentDocument", "invoice", "invoice"],
        "issuance_date": _ts("2026-05-20", "2026-06-25", "2026-05-01", "2026-05-01", "2026-06-01", "2026-07-01"),
        "due_date": _ts("2026-06-15", "2026-07-10", "2026-06-01", "2026-06-01", "2026-07-01", "2026-08-01"),
        "payment_date": _ts("2026-06-15", "2026-07-20", "2026-06-01", "2026-06-01", "2026-07-01", "2026-08-01"),
        "amount": [-400.0, -100.0, -1000.0, -5000.0, 800.0, 200.0],
        "pending_amount": [400.0, 0.0, 0.0, 5000.0, 0.0, 0.0],
        "status": ["overdue", "paid", "cancel", "pending", "paid", "paid"],
        "counterparty_id": ["S1", "S2", "S3", "S4", "CP1", "CP2"],
    })
    bal = pd.DataFrame({"product_id": ["CHK_A", "CHK_B", "SAV_A"], "company_id": ["A", "B", "A"],
                        "date": [AS_OF] * 3, "balance": [1000.0, 50.0, 5000.0]})
    return {"companies": companies, "banking_products": bank, "debt_products": debt,
            "transactions": tx, "invoices": inv, "balances": bal}


@pytest.fixture(scope="module")
def built() -> pd.DataFrame:
    return features.build(tables=_tables())


def test_build_returns_the_contract_and_only_companies_with_a_checking_balance(built):
    assert list(built.columns) == features.COLUMN_NAMES
    features.validate(built)
    assert set(built["company_id"]) == {"A", "B"}  # C tiene movimientos pero ningún saldo de cuenta corriente


def test_build_stops_at_the_last_complete_month_before_the_snapshot(built):
    a = built[built["company_id"] == "A"]
    assert list(a["month"]) == ["2026-05", "2026-06", "2026-07", "2026-08"]  # el movimiento del 2026-09-01 no crea mes
    assert list(a["months_of_history"]) == [1, 2, 3, 4]
    b = built[built["company_id"] == "B"]
    assert list(b["month"]) == ["2026-07", "2026-08"]


def test_build_reconstructs_daily_minimum_and_closing_balance_backwards(built):
    a = built[built["company_id"] == "A"].set_index("month")
    # saldo final 1.000 el 1 de septiembre, que incluye el abono de 999 de ese día
    assert a["eom_balance_eur"].tolist() == pytest.approx([201.0, -99.0, 101.0, 1.0])
    # julio arranca en −99 (cierre de junio) antes del abono de 200: el mínimo del mes es −99
    assert a["min_balance_eur"].tolist() == pytest.approx([201.0, -99.0, -99.0, 1.0])
    assert a["months_negative_6m"].tolist() == [0, 1, 2, 2]
    b = built[built["company_id"] == "B"].set_index("month")
    assert b["min_balance_eur"].tolist() == pytest.approx([70.0, 50.0])


def test_build_flows_use_operating_categories_for_inflows_and_all_charges_for_outflows(built):
    a = built[built["company_id"] == "A"].set_index("month")
    assert a["operating_inflows_eur"].tolist() == pytest.approx([500.0, 0.0, 200.0, 0.0])
    assert a["outflows_eur"].tolist() == pytest.approx([0.0, 300.0, 0.0, 100.0])
    assert a["net_cash_flow_ratio_3m"].tolist()[1:] == pytest.approx([200 / 300, 400 / 300, -0.5])
    assert np.isnan(a.loc["2026-05", "net_cash_flow_ratio_3m"])  # sin cargos aún
    assert a.loc["2026-06", "cash_buffer_days"] == pytest.approx(-99.0 / (300.0 / 30))


def test_build_ignores_cancelled_and_non_invoice_documents(built):
    a = built[built["company_id"] == "A"].set_index("month")
    # stock de vencidas: solo la de 400 (vencida en junio, nunca pagada); la de 100 se paga en julio
    assert a["overdue_received_eur"].tolist() == pytest.approx([0.0, 400.0, 400.0, 400.0])
    assert a["received_3m_eur"].tolist() == pytest.approx([400.0, 500.0, 500.0, 100.0])
    # tasa de flujo: junio 400/400, julio (400 + 100 pagada en julio) → 400/500, agosto igual
    assert np.isnan(a.loc["2026-05", "overdue_flow_rate_3m"])
    assert a["overdue_flow_rate_3m"].tolist()[1:] == pytest.approx([1.0, 0.8, 0.8])
    assert a["top_customer_share_12m"].tolist()[1:] == pytest.approx([1.0, 0.8, 0.8])


def test_build_marks_coverage_with_flags_and_nan(built):
    a = built[built["company_id"] == "A"].set_index("month")
    b = built[built["company_id"] == "B"].set_index("month")
    assert a["has_debt"].tolist() == [False, False, False, True]
    assert np.isnan(a.loc["2026-07", "dscr_6m"]) and a.loc["2026-08", "dscr_6m"] == pytest.approx(700.0 / 100.0)
    assert not b["has_invoices"].any() and b["overdue_flow_rate_3m"].isna().all()
    assert not built["has_prior_year"].any() and built["inflows_yoy_change"].isna().all()
    assert not built["has_credit_line"].any() and built["credit_line_usage"].isna().all()


def test_overdue_flow_rate_filters_cancelled_and_non_invoice_rows():
    inv = _tables()["invoices"]
    out = features.overdue_flow_rate(inv, ["2026-06"]).set_index("month")
    assert out.loc["2026-06", "due_3m_eur"] == pytest.approx(400.0)  # sin la cancelada de 1.000 ni el paymentDocument


@pytest.mark.skipif(not (artifacts_dir() / "raw" / "transactions.parquet").exists(), reason="sin caché del dataset")
def test_build_on_the_real_dataset_passes_the_contract():
    df = features.build()
    features.validate(df)
    assert df["company_id"].nunique() > 1200
    assert df["month"].max() == "2026-08"
