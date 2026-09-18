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


def test_signals_are_the_four_from_plan(mock):
    assert features.SIGNAL_COLUMNS == [
        "min_balance_eur", "overdue_received_ratio_3m", "dscr_6m", "inflows_yoy_change",
    ]
    assert set(features.SIGNAL_COLUMNS) <= set(mock.columns)


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


def test_build_is_not_implemented_yet():
    with pytest.raises(NotImplementedError, match="slice #2"):
        features.build()
