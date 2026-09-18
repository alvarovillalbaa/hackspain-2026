"""Tests de xray.labels al seam: dada una tabla, el resultado esperado (docs/rules_spec.md §2–§4)."""

import numpy as np
import pandas as pd
import pytest

from xray import labels
from xray.rules import RulesConfig


def _features(rows: list[dict]) -> pd.DataFrame:
    """Tabla mínima con las columnas que labels lee; el resto del contrato no hace falta aquí."""
    base = {
        "min_balance_eur": np.nan,
        "overdue_received_ratio_3m": np.nan,
        "dscr_6m": np.nan,
        "inflows_yoy_change": np.nan,
    }
    return pd.DataFrame([{**base, **r} for r in rows])


# --- rank_signals -------------------------------------------------------------------------


def test_rank_orients_every_signal_so_that_one_is_healthiest():
    f = _features(
        [
            {"company_id": "a", "month": "2025-01", "min_balance_eur": -100, "overdue_received_ratio_3m": 0.9,
             "dscr_6m": 0.5, "inflows_yoy_change": -0.5},
            {"company_id": "b", "month": "2025-01", "min_balance_eur": 0, "overdue_received_ratio_3m": 0.5,
             "dscr_6m": 2.0, "inflows_yoy_change": 0.0},
            {"company_id": "c", "month": "2025-01", "min_balance_eur": 100, "overdue_received_ratio_3m": 0.1,
             "dscr_6m": 5.0, "inflows_yoy_change": 0.5},
        ]
    )
    r = labels.rank_signals(f).set_index("company_id")
    for col in ("rank_balance", "rank_overdue", "rank_dscr", "rank_inflows"):
        assert r.loc["a", col] < r.loc["b", col] < r.loc["c", col], col
        assert r.loc["c", col] == 1.0


def test_rank_is_within_month_not_across_months():
    f = _features(
        [
            {"company_id": "a", "month": "2025-01", "min_balance_eur": 10},
            {"company_id": "b", "month": "2025-01", "min_balance_eur": 20},
            {"company_id": "a", "month": "2025-02", "min_balance_eur": 1_000},
            {"company_id": "b", "month": "2025-02", "min_balance_eur": 2_000},
        ]
    )
    r = labels.rank_signals(f).set_index(["company_id", "month"])
    assert r.loc[("a", "2025-01"), "rank_balance"] == r.loc[("a", "2025-02"), "rank_balance"]


def test_rank_ties_share_the_average_and_nan_is_excluded():
    f = _features(
        [
            {"company_id": "a", "month": "2025-01", "dscr_6m": 1.0},
            {"company_id": "b", "month": "2025-01", "dscr_6m": 1.0},
            {"company_id": "c", "month": "2025-01", "dscr_6m": 3.0},
            {"company_id": "d", "month": "2025-01", "dscr_6m": np.nan},
        ]
    )
    r = labels.rank_signals(f).set_index("company_id")["rank_dscr"]
    assert r["a"] == r["b"] == 0.5  # media de las posiciones 1 y 2 sobre 3 ranqueadas
    assert r["c"] == 1.0
    assert np.isnan(r["d"])


def test_rank_keeps_original_columns():
    f = _features([{"company_id": "a", "month": "2025-01", "min_balance_eur": 1}])
    r = labels.rank_signals(f)
    assert "min_balance_eur" in r.columns and "rank_balance" in r.columns


# --- state_index --------------------------------------------------------------------------


def _ranked(rows: list[dict]) -> pd.DataFrame:
    base = {"rank_balance": np.nan, "rank_overdue": np.nan, "rank_dscr": np.nan, "rank_inflows": np.nan}
    return pd.DataFrame([{**base, **r} for r in rows])


def test_state_index_is_weighted_mean_in_the_plan_order():
    cfg = RulesConfig()
    assert cfg.weights == {"balance": 0.35, "inflows": 0.25, "dscr": 0.20, "overdue": 0.20}
    r = _ranked([{"company_id": "a", "month": "2025-01", "rank_balance": 1.0, "rank_overdue": 0.0,
                  "rank_dscr": 0.0, "rank_inflows": 0.0}])
    out = labels.state_index(r, cfg)
    assert out.loc[0, "state_index"] == pytest.approx(0.35)


def test_state_index_renormalises_weights_over_available_signals():
    r = _ranked([{"company_id": "a", "month": "2025-01", "rank_balance": 0.8, "rank_inflows": 0.4}])
    out = labels.state_index(r, RulesConfig())
    expected = (0.35 * 0.8 + 0.25 * 0.4) / (0.35 + 0.25)
    assert out.loc[0, "state_index"] == pytest.approx(expected)
    assert out.loc[0, "n_signals"] == 2


def test_state_index_is_nan_with_fewer_than_two_signals():
    r = _ranked([{"company_id": "a", "month": "2025-01", "rank_balance": 0.9}])
    out = labels.state_index(r, RulesConfig())
    assert np.isnan(out.loc[0, "state_index"])
    assert out.loc[0, "n_signals"] == 1


def test_red_flags_use_the_percentile_cutoff_and_count():
    r = _ranked([{"company_id": "a", "month": "2025-01", "rank_balance": 0.20, "rank_overdue": 0.21,
                  "rank_dscr": 0.05, "rank_inflows": np.nan}])
    out = labels.state_index(r, RulesConfig()).loc[0]
    assert bool(out["red_balance"]) is True  # ≤ 0.20 es rojo
    assert bool(out["red_overdue"]) is False
    assert bool(out["red_dscr"]) is True
    assert bool(out["red_inflows"]) is False  # NaN nunca es rojo
    assert out["n_red"] == 2


# --- events -------------------------------------------------------------------------------


def _indexed(company: str, n_red: list[int | None], start: str = "2025-01") -> pd.DataFrame:
    """Serie mensual de una empresa con n_red dado; None = mes sin índice."""
    months = [str(p) for p in pd.period_range(start, periods=len(n_red), freq="M")]
    return pd.DataFrame(
        {
            "company_id": company,
            "month": months,
            "n_red": [0 if v is None else v for v in n_red],
            "state_index": [np.nan if v is None else 0.5 for v in n_red],
        }
    )


def _event_months(df: pd.DataFrame) -> list[str]:
    out = labels.events(df, RulesConfig())
    return list(out.loc[out["event"], "month"])


def test_event_starts_on_first_month_of_a_two_month_red_run():
    df = _indexed("a", [0, 0, 2, 3, 0, 0])
    assert _event_months(df) == ["2025-03"]


def test_single_red_month_is_not_an_event():
    df = _indexed("a", [0, 2, 0, 0, 3, 0])
    assert _event_months(df) == []


def test_new_event_requires_two_green_months_since_previous_run():
    # racha 03-04, un verde en 05, otra racha 06-07: mismo episodio → un solo evento
    same = _indexed("a", [0, 0, 2, 2, 0, 2, 2, 0, 0])
    assert _event_months(same) == ["2025-03"]
    # racha 03-04, dos verdes 05-06, racha 07-08: dos eventos
    two = _indexed("a", [0, 0, 2, 2, 0, 0, 2, 2, 0])
    assert _event_months(two) == ["2025-03", "2025-07"]


def test_events_are_per_company():
    df = pd.concat([_indexed("a", [2, 2, 0]), _indexed("b", [0, 2, 2])], ignore_index=True)
    out = labels.events(df, RulesConfig()).set_index(["company_id", "month"])["event"]
    assert bool(out[("a", "2025-01")]) and bool(out[("b", "2025-02")])
    assert not out[("b", "2025-01")]


def test_events_marks_in_event_months():
    df = _indexed("a", [0, 2, 2, 2, 0, 0])
    out = labels.events(df, RulesConfig())
    assert list(out["in_event"]) == [False, True, True, True, False, False]


# --- label_t6 -----------------------------------------------------------------------------


def test_label_t6_is_mean_of_next_six_index_values():
    df = _indexed("a", [0] * 8)
    df["state_index"] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    out = labels.label_t6(df, RulesConfig())
    assert out.loc[0, "label_t6"] == pytest.approx(np.mean([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))
    assert out.loc[1, "label_t6"] == pytest.approx(np.mean([0.3, 0.4, 0.5, 0.6, 0.7, 0.8]))


def test_label_t6_is_nan_when_any_future_month_is_missing():
    df = _indexed("a", [0] * 7)
    df["state_index"] = [0.1, 0.2, 0.3, np.nan, 0.5, 0.6, 0.7]
    out = labels.label_t6(df, RulesConfig())
    assert np.isnan(out.loc[0, "label_t6"])  # t+3 sin índice
    assert np.isnan(out.loc[2, "label_t6"])  # solo quedan 4 meses futuros


def test_label_t6_does_not_cross_companies():
    df = pd.concat([_indexed("a", [0] * 7), _indexed("b", [0] * 7)], ignore_index=True)
    df["state_index"] = 0.5
    out = labels.label_t6(df, RulesConfig())
    assert np.isnan(out.loc[6, "label_t6"])  # último mes de "a" no mira a "b"
    assert out.loc[0, "label_t6"] == pytest.approx(0.5)
