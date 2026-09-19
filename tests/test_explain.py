"""Tests de xray.explain al seam: atribución exacta del cambio de score y agregación por grupo."""

import numpy as np
import pandas as pd
import pytest

from xray import explain, features, labels, rules
from xray.rules import RulesConfig


@pytest.fixture(scope="module")
def scored():
    return rules.run(features.load_fixture())


def test_driver_points_add_up_to_the_score_change_when_all_signals_are_present(scored):
    d = explain.drivers(scored, RulesConfig(), lag=3)
    det = d[(d["company_id"] == "MOCK_DETERIORATION") & (d["month"] == "2026-08")]
    assert set(det["signal"]) == set(labels.SIGNALS)
    s = scored[scored["company_id"] == "MOCK_DETERIORATION"].set_index("month")
    assert det["delta_points"].sum() == pytest.approx(s.loc["2026-08", "score"] - s.loc["2026-05", "score"], abs=1e-6)
    assert det["delta_points"].max() <= 0  # todo empuja hacia abajo en el deterioro


def test_drivers_carry_the_raw_value_and_the_rank_of_each_signal(scored):
    d = explain.drivers(scored, RulesConfig(), lag=3)
    row = d[(d["company_id"] == "MOCK_DIP") & (d["month"] == "2026-08") & (d["signal"] == "balance")].iloc[0]
    src = scored[(scored["company_id"] == "MOCK_DIP") & (scored["month"] == "2026-08")].iloc[0]
    assert row["column"] == "cash_buffer_days"
    assert row["value"] == pytest.approx(src["cash_buffer_days"]) and row["rank"] == pytest.approx(src["rank_balance"])


def test_red_since_is_the_first_month_of_the_current_red_run():
    df = pd.DataFrame({"company_id": ["a"] * 5, "month": ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"],
                       "red_balance": [False, True, False, True, True], "red_overdue": [True] * 5,
                       "red_dscr": [False] * 5, "red_inflows": [False] * 5})
    out = explain.red_since(df).set_index("month")
    as_list = lambda s: [None if pd.isna(x) else x for x in s]
    assert as_list(out["since_balance"]) == [None, "2025-02", None, "2025-04", "2025-04"]
    assert as_list(out["since_overdue"]) == ["2025-01"] * 5
    assert out["since_dscr"].isna().all()


def test_drivers_json_lists_signals_by_absolute_effect(scored):
    js = explain.drivers_json(scored, RulesConfig(), lag=3)
    row = js[(js["company_id"] == "MOCK_DETERIORATION") & (js["month"] == "2026-08")].iloc[0]["drivers"]
    assert [d["signal"] for d in row] == sorted((d["signal"] for d in row),
                                                key=lambda s: -abs(next(x["delta"] for x in row if x["signal"] == s)))
    assert {"signal", "delta", "since", "value", "rank"} <= set(row[0])


def test_group_rollup_weights_by_inflows_and_names_the_weakest_company(scored):
    companies = pd.DataFrame({"company_id": ["MOCK_DIP", "MOCK_DETERIORATION", "MOCK_SHORT"],
                              "group_id": ["G1", "G1", "G2"]})
    g = explain.group_rollup(scored, companies).set_index(["group_id", "month"])
    row = g.loc[("G1", "2026-08")]
    assert row["n_companies"] == 2 and row["weakest_company_id"] == "MOCK_DETERIORATION"
    s = scored[scored["month"] == "2026-08"].set_index("company_id")
    w = s.loc[["MOCK_DIP", "MOCK_DETERIORATION"], "operating_inflows_eur"]
    expected = (s.loc[w.index, "score"] * w).sum() / w.sum()
    assert row["score"] == pytest.approx(expected)
    assert row["score_min"] == pytest.approx(s.loc["MOCK_DETERIORATION", "score"])
    assert np.isnan(g.loc[("G2", "2025-03"), "score"]) if ("G2", "2025-03") in g.index else True
