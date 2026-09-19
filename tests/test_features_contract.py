"""Tests al seam `features(company_id, month)`: el contrato y la fixture, no la construcción.

La fixture es la propuesta de ML-2 (19 sep) para el slice #2. Cuando ML-1 produzca la tabla
real, `features.validate()` es lo que tiene que pasar; estos tests no cambian.
"""

import numpy as np
import pandas as pd
import pytest

from xray import features


@pytest.fixture(scope="module")
def mock():
    return features.load_fixture()


def test_fixture_has_exact_contract_columns(mock):
    assert list(mock.columns) == features.COLUMN_NAMES


def test_fixture_has_three_designed_companies(mock):
    lengths = mock.groupby("company_id").size().to_dict()
    assert lengths == {"MOCK_DIP": 18, "MOCK_DETERIORATION": 18, "MOCK_SHORT": 5}


def test_signals_are_the_four_v2_from_the_review(mock):
    assert features.SIGNAL_COLUMNS == [
        "cash_buffer_days", "overdue_flow_rate_3m", "dscr_6m", "net_cash_flow_ratio_3m",
    ]
    assert set(features.SIGNAL_COLUMNS) <= set(mock.columns)


def test_fixture_deterioration_turns_the_v2_signals_red(mock):
    det = mock[mock["company_id"] == "MOCK_DETERIORATION"].set_index("month")
    assert det.loc["2026-08", "cash_buffer_days"] < 0
    assert det.loc["2026-08", "net_cash_flow_ratio_3m"] < -0.2
    assert det.loc["2026-08", "overdue_flow_rate_3m"] > 0.5
    dip = mock[mock["company_id"] == "MOCK_DIP"].set_index("month")
    assert dip["overdue_flow_rate_3m"].max() < 0.25
    assert (dip["cash_buffer_days"] < 0).sum() == 1


def test_derive_computes_net_cash_flow_and_buffer_days_from_contract_columns():
    df = pd.DataFrame({
        "company_id": ["a"] * 3,
        "month": ["2025-01", "2025-02", "2025-03"],
        "operating_inflows_eur": [100.0, 100.0, 40.0],
        "outflows_eur": [80.0, 80.0, 80.0],
        "min_balance_eur": [40.0, -8.0, 0.0],
    })
    out = features.derive(df)
    # mes 1: (100 − 80) / 80; mes 3: (240 − 240) / 240 = 0
    assert out["net_cash_flow_ratio_3m"].tolist() == pytest.approx([0.25, 0.25, 0.0])
    assert out["cash_buffer_days"].tolist() == pytest.approx([15.0, -3.0, 0.0])


def test_derive_is_nan_when_outflows_are_zero_and_keeps_row_order():
    df = pd.DataFrame({
        "company_id": ["b", "a"],
        "month": ["2025-01", "2025-01"],
        "operating_inflows_eur": [10.0, 10.0],
        "outflows_eur": [0.0, 20.0],
        "min_balance_eur": [5.0, 5.0],
    })
    out = features.derive(df)
    assert list(out["company_id"]) == ["b", "a"]
    assert np.isnan(out.loc[0, "net_cash_flow_ratio_3m"]) and np.isnan(out.loc[0, "cash_buffer_days"])
    assert out.loc[1, "cash_buffer_days"] == pytest.approx(7.5)


def test_overdue_flow_rate_counts_invoices_due_in_the_last_three_months_unpaid_at_month_end():
    inv = pd.DataFrame({
        "company_id": ["a", "a", "a", "a"],
        "direction": ["received", "received", "received", "issued"],
        "amount": [-100.0, -300.0, -50.0, 999.0],
        "status": ["paid", "overdue", "paid", "overdue"],
        "due_date": pd.to_datetime(["2025-01-15", "2025-02-10", "2025-03-05", "2025-01-01"]),
        "payment_date": pd.to_datetime(["2025-01-20", "2025-02-10", "2025-04-02", "2025-01-01"]),
    })
    out = features.overdue_flow_rate(inv, ["2025-01", "2025-02", "2025-03", "2025-04"]).set_index("month")
    # ene: vence 100, pagada en enero → 0/100 · feb: vencen 100+300, la de 300 sigue impagada → 300/400
    # mar: vencen 100+300+50, la de 50 se paga en abril → 350/450 · abr: ventana feb–abr → 300/350
    assert out.loc["2025-01", "overdue_flow_rate_3m"] == pytest.approx(0.0)
    assert out.loc["2025-02", "overdue_flow_rate_3m"] == pytest.approx(0.75)
    assert out.loc["2025-03", "overdue_flow_rate_3m"] == pytest.approx(350 / 450)
    assert out.loc["2025-04", "overdue_flow_rate_3m"] == pytest.approx(300 / 350)
    assert out["due_3m_eur"].tolist() == pytest.approx([100.0, 400.0, 450.0, 350.0])


def test_validate_accepts_negative_buffer_days_and_rejects_rate_above_one(mock):
    ok = mock.copy()
    ok.loc[0, "cash_buffer_days"] = -12.0
    features.validate(ok)
    broken = mock.copy()
    broken.loc[0, "overdue_flow_rate_3m"] = 1.5
    with pytest.raises(ValueError, match="cuota > 1"):
        features.validate(broken)


def test_dip_is_a_dip_not_a_deterioration(mock):
    dip = mock[mock["company_id"] == "MOCK_DIP"].set_index("month")
    assert (dip["min_balance_eur"] < 0).sum() == 1  # un solo mes en negativo
    assert dip.loc["2026-01", "min_balance_eur"] > 0  # recuperado en ≤ 2 meses
    assert dip["overdue_received_ratio_3m"].max() < 0.25
    assert dip["dscr_6m"].min() > 2.5


def test_deterioration_has_two_signals_red_for_six_consecutive_months(mock):
    det = mock[mock["company_id"] == "MOCK_DETERIORATION"].set_index("month")
    red_months = det.index[(det["min_balance_eur"] < 0) & (det["overdue_received_ratio_3m"] > 0.3)]
    assert list(red_months) == ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]
    assert det.loc["2026-08", "dscr_6m"] < 1.0
    assert det.loc["2026-08", "inflows_yoy_change"] < -0.3
    # Antes del deterioro las dos empresas de 18 meses son indistinguibles.
    dip = mock[mock["company_id"] == "MOCK_DIP"].set_index("month")
    pd.testing.assert_frame_equal(
        det.loc[:"2025-10", features.SIGNAL_COLUMNS], dip.loc[:"2025-10", features.SIGNAL_COLUMNS]
    )


def test_short_history_marks_missing_coverage_as_nan_not_zero(mock):
    short = mock[mock["company_id"] == "MOCK_SHORT"]
    assert not short["has_debt"].any() and not short["has_prior_year"].any()
    assert short["dscr_6m"].isna().all()
    assert short["inflows_yoy_change"].isna().all()
    assert short["credit_line_usage"].isna().all()
    assert short["overdue_received_ratio_3m"].notna().all()  # sí tiene facturas
    assert short["months_of_history"].max() == 5


def test_validate_rejects_gap_in_months(mock):
    broken = mock[mock["month"] != "2025-06"]
    with pytest.raises(ValueError, match="no consecutivos"):
        features.validate(broken)


def test_validate_rejects_value_without_coverage(mock):
    broken = mock.copy()
    broken.loc[broken["company_id"] == "MOCK_SHORT", "dscr_6m"] = 3.0
    with pytest.raises(ValueError, match="has_debt == False"):
        features.validate(broken)


def test_validate_rejects_duplicate_grain(mock):
    broken = pd.concat([mock, mock.iloc[[0]]], ignore_index=True)
    with pytest.raises(ValueError, match="grano roto"):
        features.validate(broken)


def test_validate_rejects_missing_column(mock):
    with pytest.raises(ValueError, match="faltan columnas"):
        features.validate(mock.drop(columns=["min_balance_eur"]))


def test_validate_rejects_nan_in_required_column(mock):
    broken = mock.copy()
    broken.loc[0, "min_balance_eur"] = np.nan
    with pytest.raises(ValueError, match="no anulable"):
        features.validate(broken)
