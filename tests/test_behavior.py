"""Tests de xray.behavior: objetivo de adopción y modelo de propensión (experimento A3)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from xray import behavior
from xray.behavior import FEATURE_COLS

EVENT_COLUMNS = [
    "company_id", "month", "product", "source", "amount_eur", "pre_months", "post_months",
]


def _panel(spec: dict[str, tuple[str, int]], seed: int = 0) -> pd.DataFrame:
    """Panel puntuado de juguete: una fila por (empresa, mes) y todas las FEATURE_COLS en ruido."""
    rng = np.random.default_rng(seed)
    rows = [
        {"company_id": cid, "month": str(p)}
        for cid, (start, n) in spec.items()
        for p in pd.period_range(start, periods=n, freq="M")
    ]
    panel = pd.DataFrame(rows)
    for col in FEATURE_COLS:
        panel[col] = rng.normal(size=len(panel))
    return panel


def _events(rows: list[tuple[str, str, str]]) -> pd.DataFrame:
    """Eventos con el contrato de `xray.adoption`; aquí solo pesan company_id, month y product."""
    ev = pd.DataFrame(rows, columns=["company_id", "month", "product"])
    extra = {"source": "line_tx", "amount_eur": 1000.0, "pre_months": 6, "post_months": 6}
    return ev.assign(**extra)[EVENT_COLUMNS]


# --- adoption_target ----------------------------------------------------------------------

SPEC = {
    "a": ("2025-01", 12),  # contrata en 2025-07, con panel de sobra por delante
    "b": ("2025-01", 12),  # nunca contrata `line` (su evento es de otro producto)
    "c": ("2025-01", 12),  # contrata en el segundo mes: un solo mes en riesgo, positivo
    "d": ("2025-01", 6),   # panel corto: el filtro de horizonte muerde
    "e": ("2025-01", 12),  # dos eventos de `line`, el primero manda
}
EVENTS = [
    ("a", "2025-07", "line"),
    ("c", "2025-02", "line"),
    ("d", "2025-05", "line"),
    ("e", "2025-09", "line"),
    ("e", "2025-05", "line"),
    ("b", "2025-03", "loan"),
]


def _target(horizon: int = 3) -> pd.DataFrame:
    return behavior.adoption_target(_panel(SPEC), _events(EVENTS), "line", horizon=horizon)


def _months(out: pd.DataFrame, cid: str) -> list[str]:
    return sorted(out.loc[out["company_id"] == cid, "month"])


def _labels(out: pd.DataFrame, cid: str) -> dict[str, int]:
    sel = out[out["company_id"] == cid].sort_values("month")
    return {m: int(y) for m, y in zip(sel["month"], sel["y"])}


def test_adoption_target_drops_the_event_month_and_everything_after():
    out = _target()
    assert _months(out, "a") == [f"2025-0{i}" for i in range(1, 7)]
    assert _months(out, "c") == ["2025-01"]


def test_adoption_target_marks_the_horizon_months_before_the_event():
    out = _target()
    assert _labels(out, "a") == {
        "2025-01": 0, "2025-02": 0, "2025-03": 0,
        "2025-04": 1, "2025-05": 1, "2025-06": 1,
    }
    assert _labels(out, "c") == {"2025-01": 1}


def test_adoption_target_requires_horizon_months_of_panel_after_the_row():
    out = _target()
    # `b` llega hasta 2025-12, así que los tres últimos meses no tienen futuro que observar
    assert _months(out, "b") == [f"2025-{i:02d}" for i in range(1, 10)]
    assert set(_labels(out, "b").values()) == {0}


def test_adoption_target_measures_the_future_against_the_full_panel_not_the_at_risk_rows():
    # `d` va de 2025-01 a 2025-06 y contrata en 2025-05: en riesgo 01–04, con futuro 01–03.
    # Si el último mes se midiera sobre las filas en riesgo (máx. 2025-04) solo quedaría 2025-01.
    out = _target()
    assert _months(out, "d") == ["2025-01", "2025-02", "2025-03"]
    assert _labels(out, "d") == {"2025-01": 0, "2025-02": 1, "2025-03": 1}


def test_adoption_target_uses_the_first_event_of_the_company_and_ignores_other_products():
    out = _target()
    assert _months(out, "e") == [f"2025-0{i}" for i in range(1, 5)]  # primer evento: 2025-05
    assert _labels(out, "e") == {"2025-01": 0, "2025-02": 1, "2025-03": 1, "2025-04": 1}
    assert len(_months(out, "b")) == 9  # el evento de `loan` de `b` no cuenta para `line`


def test_adoption_target_keeps_the_panel_columns_and_index():
    panel = _panel(SPEC)
    out = behavior.adoption_target(panel, _events(EVENTS), "line", horizon=3)
    assert list(out.columns) == [*panel.columns, "y"]
    assert out.index.isin(panel.index).all()
    assert panel.loc[out.index, "month"].tolist() == out["month"].tolist()
    assert len(out) == 6 + 9 + 1 + 3 + 4


# --- fit_propensity / predict_propensity --------------------------------------------------


def _synthetic(n_companies: int = 40, n_months: int = 18, seed: int = 7):
    """Mitad de la población ve caer su colchón de caja y contrata `line` al bajar de 10 días.

    El resto se mantiene holgado. El nivel de `cash_buffer_days` es la única señal: las demás
    FEATURE_COLS son ruido, y los meses lejanos al evento del adoptante siguen siendo negativos.
    """
    rng = np.random.default_rng(seed)
    months = [str(p) for p in pd.period_range("2025-01", periods=n_months, freq="M")]
    rows: list[dict] = []
    events: list[tuple[str, str, str]] = []
    for i in range(n_companies):
        cid = f"c{i:02d}"
        adopts = i % 2 == 0
        if adopts:
            k = int(rng.integers(4, 15))  # mes en el que el colchón cruza los 10 días
            drift = float(rng.uniform(-2.5, -1.0))
            start = 10 - drift * k
            events.append((cid, months[k], "line"))
        else:
            drift = float(rng.uniform(-0.3, 0.8))
            start = float(rng.uniform(30, 70))
        buffer_days = start + drift * np.arange(n_months) + rng.normal(0, 1.0, n_months)
        rows += [
            {"company_id": cid, "month": m, "cash_buffer_days": float(b)}
            for m, b in zip(months, buffer_days)
        ]
    panel = pd.DataFrame(rows)
    for col in FEATURE_COLS:
        if col != "cash_buffer_days":
            panel[col] = rng.normal(size=len(panel))
    return panel[["company_id", "month", *FEATURE_COLS]], _events(events)


def test_fit_propensity_learns_the_cash_buffer_signal():
    panel, events = _synthetic()
    result = behavior.fit_propensity(panel, events, "line", panel["company_id"])
    target = behavior.adoption_target(panel, events, "line", horizon=3)
    assert result.product == "line" and result.horizon == 3
    assert result.n_rows == len(target)
    assert result.n_pos == int(target["y"].sum()) > 0
    assert result.auc_mean > 0.65
    assert result.auc_std >= 0


def test_fit_propensity_returns_out_of_fold_probabilities_aligned_to_the_at_risk_rows():
    panel, events = _synthetic()
    result = behavior.fit_propensity(panel, events, "line", panel["company_id"])
    target = behavior.adoption_target(panel, events, "line", horizon=3)
    assert result.oof.index.equals(target.index)
    assert result.oof.notna().all()
    assert result.oof.between(0, 1).all()


def test_fit_propensity_ranks_the_features_by_gain():
    panel, events = _synthetic()
    result = behavior.fit_propensity(panel, events, "line", panel["company_id"])
    assert sorted(result.importance.index) == sorted(FEATURE_COLS)
    assert result.importance.is_monotonic_decreasing
    assert result.importance.idxmax() == "cash_buffer_days"


def test_fit_propensity_accepts_groups_as_a_map_from_company_to_fold():
    panel, events = _synthetic()
    companies = panel["company_id"].drop_duplicates().sort_values()
    by_company = pd.Series(range(len(companies)), index=companies.to_numpy())
    result = behavior.fit_propensity(panel, events, "line", by_company)
    assert result.auc_mean > 0.65


def test_fit_propensity_survives_a_product_that_nobody_adopts():
    panel = _panel(SPEC)
    result = behavior.fit_propensity(panel, _events(EVENTS), "factoring", panel["company_id"])
    assert result.n_pos == 0 and result.n_rows > 0  # todo el panel está en riesgo
    assert np.isnan(result.auc_mean) and np.isnan(result.auc_std)  # ningún fold llega a correr
    assert result.oof.isna().all()


def test_predict_propensity_scores_every_row_it_is_given():
    panel, events = _synthetic()
    result = behavior.fit_propensity(panel, events, "line", panel["company_id"])
    p = behavior.predict_propensity(result, panel)
    assert isinstance(p, np.ndarray)
    assert len(p) == len(panel)  # sin máscara de riesgo: puntúa lo que le pasen
    assert np.all((p >= 0) & (p <= 1))
