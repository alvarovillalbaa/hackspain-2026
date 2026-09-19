"""Tests de xray.eventstudy al seam: dado un panel sintético, el efecto que debe recuperar (A2)."""

import numpy as np
import pandas as pd
import pytest

from xray import eventstudy


def _panel(effect=0.3, n_companies=80, n_months=24, seed=1):
    """Panel sintético: efecto fijo de empresa + efecto de mes + ruido; 25 tratadas con efecto `effect`
    desde el mes del evento (inclusive)."""
    rng = np.random.default_rng(seed)
    months = pd.period_range("2024-09", periods=n_months, freq="M").astype(str)
    rows = []
    treated = {f"C{i:03d}": 8 + (i % 8) for i in range(25)}  # evento entre el mes 8 y el 15
    for i in range(n_companies):
        cid = f"C{i:03d}"
        alpha = rng.normal(0.5, 0.1)
        for j, m in enumerate(months):
            y = alpha + 0.02 * np.sin(j) + rng.normal(0, 0.05)
            if cid in treated and j >= treated[cid]:
                y += effect
            rows.append((cid, m, y, y))
    panel = pd.DataFrame(rows, columns=["company_id", "month", "y", "state_index"])
    events = pd.DataFrame({"company_id": list(treated), "month": [months[j] for j in treated.values()]})
    return panel, events


def test_matched_att_recovers_effect():
    panel, events = _panel(effect=0.3)
    res = eventstudy.matched_att(panel, events, "y", horizons=(1, 3, 6), n_boot=100)
    assert list(res["h"]) == [1, 3, 6]
    assert (res["att"] - 0.3).abs().max() < 0.08
    assert (res["pretrend_att"].abs() < 0.08).all()
    assert (res["ci_lo"] < res["att"]).all() and (res["att"] < res["ci_hi"]).all()
    assert (res["n_events"] > 0).all()


def test_matched_att_null_effect():
    panel, events = _panel(effect=0.0, seed=2)
    res = eventstudy.matched_att(panel, events, "y", horizons=(3,), n_boot=100)
    assert abs(res.loc[0, "att"]) < 0.05


def test_binary_outcome_and_future_any_below():
    panel, events = _panel(effect=-0.6)
    panel = eventstudy.future_any_below(panel, "y", h=3, threshold=0.2, name="low3")
    assert panel["low3"].dtype == object or panel["low3"].isna().any()  # NaN al final de la historia
    res = eventstudy.matched_att(panel, events, "low3", horizons=(1,), binary=True, n_boot=50)
    assert res.loc[0, "att"] > 0.3  # las tratadas caen por debajo de 0,2 mucho más que los controles


def test_did_not_yet_treated_recovers_effect():
    panel, events = _panel(effect=0.3)
    res = eventstudy.did_not_yet_treated(panel, events, "y", horizons=(1, 3), n_boot=100)
    assert (res["att"] - 0.3).abs().max() < 0.08
    assert (res["n_cohorts"] >= 5).all()


# --- casos deterministas: ventana de exclusión, primer evento y columnas --------------------


def _toy_panel():
    """12 meses planos a 0; T sube +1 desde su evento (mes 6) y X sube +5 desde el suyo (mes 8)."""
    months = pd.period_range("2025-01", periods=12, freq="M").astype(str)
    bump = {"T": (6, 1.0), "X": (8, 5.0)}
    rows = []
    for cid in ["T", "X", "N1", "N2", "N3"]:
        start, size = bump.get(cid, (99, 0.0))
        for j, m in enumerate(months):
            y = size if j >= start else 0.0
            rows.append((cid, m, y, y))
    panel = pd.DataFrame(rows, columns=["company_id", "month", "y", "state_index"])
    events = pd.DataFrame({"company_id": ["T", "X"], "month": [months[6], months[8]]})
    return panel, events


def test_controls_exclude_companies_treated_inside_the_window():
    # n_quantiles=1 mete a todas en el mismo estrato: lo único que filtra controles es la ventana.
    panel, events = _toy_panel()
    strict = eventstudy.matched_att(panel, events, "y", horizons=(3,), n_quantiles=1, n_boot=20)
    # T (efecto 1, sin X: su evento cae en [3, 12]) y X (efecto 5, sin T: su evento cae en [5, 14]).
    assert strict.loc[0, "n_events"] == 2
    assert strict.loc[0, "mean_control"] == pytest.approx(0.0)
    assert strict.loc[0, "att"] == pytest.approx((1.0 + 5.0) / 2)
    relaxed = eventstudy.matched_att(
        panel, events, "y", horizons=(3,), n_quantiles=1, exclusion=(0, 1), n_boot=20
    )
    # Con la ventana corta X entra como control de T (media 5/4) y T como control de X (cambio 0).
    assert relaxed.loc[0, "att"] == pytest.approx(((1.0 - 5.0 / 4) + 5.0) / 2)


def test_repeated_events_use_the_first_month():
    panel, events = _toy_panel()
    later = events[events["company_id"] == "T"].assign(month="2025-11")
    repeated = pd.concat([events, later], ignore_index=True)
    res = eventstudy.matched_att(panel, repeated, "y", horizons=(3,), n_quantiles=1, n_boot=20)
    assert res.loc[0, "n_events"] == 2  # T una sola vez, con su primer mes
    assert res.loc[0, "att"] == pytest.approx((1.0 + 5.0) / 2)


def test_column_contract():
    panel, events = _panel(effect=0.1, n_companies=20, n_months=18, seed=3)  # eventos sin panel
    matched = eventstudy.matched_att(panel, events, "y", horizons=(1,), n_boot=20)
    assert list(matched.columns) == [
        "h", "n_events", "mean_treated", "mean_control", "att", "se", "ci_lo", "ci_hi",
        "pretrend_att", "pretrend_se",
    ]
    did = eventstudy.did_not_yet_treated(panel, events, "y", horizons=(1,), n_boot=20)
    assert list(did.columns) == ["h", "n_events", "n_cohorts", "att", "se", "ci_lo", "ci_hi"]
