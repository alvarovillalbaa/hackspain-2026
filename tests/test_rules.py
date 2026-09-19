"""Tests de xray.rules al seam (docs/rules_spec.md §3, §5, §6)."""

import json
from dataclasses import asdict

import numpy as np
import pandas as pd
import pytest

from xray import features, labels, rules
from xray.rules import RulesConfig, RulesModel


def _series(company: str, values: list, col: str, start: str = "2025-01", **extra) -> pd.DataFrame:
    months = [str(p) for p in pd.period_range(start, periods=len(values), freq="M")]
    df = pd.DataFrame({"company_id": company, "month": months, col: values})
    for k, v in extra.items():
        df[k] = v
    return df


# --- level --------------------------------------------------------------------------------


def test_level_is_trailing_mean_of_six_months():
    df = _series("a", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], "state_index")
    out = rules.level(df, RulesConfig())
    assert out.loc[5, "level"] == pytest.approx(np.mean([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]))
    assert out.loc[6, "level"] == pytest.approx(np.mean([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]))


def test_level_falls_back_to_available_months_when_history_is_short():
    df = _series("a", [0.4, 0.8], "state_index")
    out = rules.level(df, RulesConfig())
    assert out.loc[0, "level"] == pytest.approx(0.4)
    assert out.loc[1, "level"] == pytest.approx(0.6)


def test_level_is_nan_only_where_index_is_nan_and_skips_nan_in_window():
    df = _series("a", [np.nan, 0.2, np.nan, 0.6], "state_index")
    out = rules.level(df, RulesConfig())
    assert np.isnan(out.loc[0, "level"])
    assert out.loc[3, "level"] == pytest.approx(0.4)  # media de 0.2 y 0.6


# --- fit / RulesModel ---------------------------------------------------------------------


def _train_table(n: int = 200, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    level = rng.uniform(0, 1, n)
    label = np.clip(0.2 + 0.6 * level + rng.normal(0, 0.05, n), 0, 1)
    months = [str(p) for p in pd.period_range("2024-09", periods=12, freq="M")]
    return pd.DataFrame(
        {
            "company_id": [f"c{i}" for i in range(n)],
            "month": rng.choice(months, n),
            "level": level,
            "label_t6": label,
        }
    )


def test_fit_returns_monotone_map_and_scores_in_0_100():
    m = rules.fit(_train_table(), RulesConfig(), train_until="2025-08")
    grid = np.linspace(0, 1, 50)
    pred = m.predict(grid)
    assert np.all(np.diff(pred) >= 0)
    assert pred.min() >= 0 and pred.max() <= 100
    assert pred[-1] > pred[0]


def test_fit_uses_only_rows_up_to_train_until_and_with_label():
    t = _train_table()
    t.loc[:99, "month"] = "2026-01"  # después del corte
    t.loc[100:129, "label_t6"] = np.nan  # sin etiqueta
    m = rules.fit(t, RulesConfig(), train_until="2025-08")
    assert m.n_train == 70


def test_fit_stores_lead_cutoff_as_20th_percentile_of_train_scores():
    t = _train_table()
    m = rules.fit(t, RulesConfig(), train_until="2025-08")
    train_scores = m.predict(t["level"].to_numpy())
    assert m.lead_cutoff == pytest.approx(np.percentile(train_scores, 20))


def test_model_roundtrips_through_json(tmp_path):
    m = rules.fit(_train_table(), RulesConfig(), train_until="2025-08")
    path = tmp_path / "rules_model.json"
    m.save(path)
    loaded = RulesModel.load(path)
    grid = np.linspace(0, 1, 20)
    np.testing.assert_allclose(loaded.predict(grid), m.predict(grid))
    assert loaded.train_until == "2025-08" and loaded.lead_cutoff == m.lead_cutoff
    assert loaded.projection_edges == m.projection_edges
    assert loaded.projection_points == m.projection_points
    assert json.loads(path.read_text())["knots_x"]  # legible sin Python


# --- identidad nivel(t+6) = etiqueta(t) ---------------------------------------------------


def test_level_window_equals_horizon_so_future_score_is_the_map_of_the_label():
    """El score de dentro de 6 meses es exactamente el mapa aplicado a label_t6 (docs/model_card.md §5).

    Vale porque el nivel promedia los mismos 6 meses que la etiqueta. Si alguien cambia
    `level_window` o `horizon` por separado, la proyección del score deja de poder leerse de la
    etiqueta y este test lo dice antes que la pantalla."""
    cfg = RulesConfig()
    assert cfg.level_window == cfg.horizon, "level_window y horizon tienen que coincidir (model_card.md §5)"
    scored = rules.run(features.derive(features.load_fixture()), cfg=cfg).sort_values(["company_id", "month"])
    future = scored.groupby("company_id")["score"].shift(-cfg.horizon)
    both = future.notna() & scored["label_t6"].notna()
    assert both.sum() > 0
    model = rules.fit(scored, cfg)
    np.testing.assert_allclose(model.predict(scored.loc[both, "label_t6"]), future[both], atol=1e-9)


# --- outlook ------------------------------------------------------------------------------


def _outlook(reds: list[bool]) -> list[str]:
    df = _series("a", [2 if r else 0 for r in reds], "n_red")
    return list(rules.outlook(df, RulesConfig())["outlook"])


def test_outlook_turns_negative_exactly_on_third_red_month():
    out = _outlook([False, False, False, True, True, True, True])
    assert out[4] == "stable"  # dos rojos
    assert out[5] == "negative"  # tercer rojo, y el último es rojo
    assert out[6] == "negative"


def test_outlook_is_not_negative_when_last_month_is_green():
    out = _outlook([False, False, False, True, True, True, False])
    assert out[5] == "negative" and out[6] == "stable"  # 3 rojos en la ventana, pero t es verde


def test_outlook_positive_after_three_greens_following_a_single_red():
    #            t-5    t-4    t-3    t-2    t-1    t
    assert _outlook([True, False, False, False, False, False])[5] == "positive"  # un rojo basta (19 sep)
    assert _outlook([True, True, False, False, False, False])[5] == "positive"
    # con la convención anterior (dos rojos) un solo rojo no cuenta como racha
    df = _series("a", [2, 0, 0, 0, 0, 0], "n_red")
    assert rules.outlook(df, RulesConfig(outlook_streak_min=2))["outlook"].iloc[5] == "stable"


def test_outlook_is_stable_with_short_history():
    assert _outlook([True, True, True]) == ["stable", "stable", "stable"]


# --- trend --------------------------------------------------------------------------------


def _trend(index: list[float]) -> list[str]:
    df = rules.level(_series("a", index, "state_index"), RulesConfig())
    return list(rules.trend(df, RulesConfig())["trend"])


def test_trend_is_improving_when_the_last_three_months_run_above_the_level():
    out = _trend([0.5] * 8 + [0.8] * 3)
    assert out[-1] == "improving"
    assert out[7] == "flat"


def test_trend_is_worsening_when_the_last_three_months_run_below_the_level():
    assert _trend([0.5] * 8 + [0.2] * 3)[-1] == "worsening"


def test_trend_is_flat_without_momentum_or_with_short_history():
    assert _trend([0.5] * 8) == ["flat"] * 8
    assert _trend([0.2, 0.8]) == ["flat", "flat"]


# --- watch --------------------------------------------------------------------------------


def _events_ext(rows: list[tuple[str, str, str]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["company_id", "month", "kind"])


def test_watch_is_active_for_three_months_then_expires():
    df = _series("a", [0] * 6, "n_red")
    ev = _events_ext([("a", "2025-02", "large_maturity")])
    out = list(rules.watch(df, ev, RulesConfig())["watch"])
    assert out == [None, "large_maturity", "large_maturity", "large_maturity", None, None]


def test_watch_priority_and_none_without_events():
    df = _series("a", [0] * 3, "n_red")
    ev = _events_ext([("a", "2025-02", "expensive_new_debt"), ("a", "2025-02", "main_customer_lost")])
    assert rules.watch(df, ev, RulesConfig()).loc[1, "watch"] == "main_customer_lost"
    assert rules.watch(df, None, RulesConfig())["watch"].isna().all()


def test_watch_rejects_unknown_kind():
    df = _series("a", [0] * 2, "n_red")
    with pytest.raises(ValueError, match="kind"):
        rules.watch(df, _events_ext([("a", "2025-01", "alien")]), RulesConfig())


# --- confidence ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "months,n_signals,expected",
    [(12, 3, "high"), (12, 4, "high"), (12, 2, "medium"), (6, 2, "medium"), (11, 3, "medium"),
     (5, 4, "low"), (6, 1, "low")],
)
def test_confidence_tiers(months, n_signals, expected):
    df = pd.DataFrame({"months_of_history": [months], "n_signals": [n_signals]})
    assert rules.confidence(df, RulesConfig())["confidence"].iloc[0] == expected


# --- score / run --------------------------------------------------------------------------


def _fixture_events() -> pd.DataFrame:
    return pd.read_csv(features.FIXTURE_PATH.parent / "events_mock.csv")


def test_run_on_fixture_smoke():
    out = rules.run(features.load_fixture(), events_ext=_fixture_events())
    assert len(out) == 41
    for col in ("state_index", "level", "score", "outlook", "trend", "watch", "confidence", "event", "label_t6",
                "proj_p10", "proj_p50", "proj_p90"):
        assert col in out.columns, col
    has_index = out["state_index"].notna()
    assert out.loc[has_index, "score"].between(0, 100).all()
    assert out.loc[has_index, "score"].notna().all()
    assert set(out["outlook"]) <= {"negative", "positive", "stable"}
    assert set(out["trend"]) <= {"improving", "flat", "worsening"}
    assert set(out["confidence"]) <= {"high", "medium", "low"}


def test_run_with_given_model_does_not_refit(tmp_path):
    feats = features.load_fixture()
    first = rules.run(feats)
    model = rules.fit(first, RulesConfig(), train_until="2025-08")
    again = rules.run(feats, model=model)
    np.testing.assert_allclose(first["score"].to_numpy(), again["score"].to_numpy())


def test_short_history_company_has_low_confidence_and_a_score():
    out = rules.run(features.load_fixture()).set_index("company_id")
    short = out.loc["MOCK_SHORT"]
    assert (short["confidence"] == "low").all()
    assert short["score"].notna().all()


def test_watch_from_events_fixture_lands_on_deterioration():
    out = rules.run(features.load_fixture(), events_ext=_fixture_events())
    det = out[out["company_id"] == "MOCK_DETERIORATION"].set_index("month")
    assert det.loc["2026-05", "watch"] == "large_maturity"
    assert det.loc["2026-08", "watch"] is None
    assert out.loc[out["company_id"] == "MOCK_DIP", "watch"].isna().all()


# --- bache vs deterioro, con rangos escritos a mano -----------------------------------------


def _ranked_series(company: str, ranks: list[float], months_of_history: int | None = None) -> pd.DataFrame:
    """Las cuatro señales con el mismo rango cada mes: aislamos la dinámica temporal."""
    months = [str(p) for p in pd.period_range("2025-03", periods=len(ranks), freq="M")]
    df = pd.DataFrame({"company_id": company, "month": months})
    for s in ("balance", "overdue", "dscr", "inflows"):
        df[f"rank_{s}"] = ranks
    df["months_of_history"] = np.arange(1, len(ranks) + 1)
    return df


def _score_ranked(df: pd.DataFrame) -> pd.DataFrame:
    idx = labels.label_t6(labels.events(labels.state_index(df)))
    lvl = rules.level(idx)
    # mapa identidad: score = 100 × nivel, para que los tests hablen de nivel sin ruido de ajuste;
    # un solo tramo de proyección, que aquí no se mira, porque `score` siempre calcula el abanico
    model = RulesModel(knots_x=[0.0, 1.0], knots_y=[0.0, 100.0], train_until="x", lead_cutoff=20.0, n_train=0,
                       projection_edges=[0.0, 1.0], projection_points=[[0.0, 50.0, 100.0]])
    return rules.score(lvl, model)


def test_dip_barely_moves_level_and_stays_stable():
    ranks = [0.7] * 8 + [0.1, 0.15] + [0.7] * 8  # dos meses rojos, recupera
    out = _score_ranked(_ranked_series("dip", ranks))
    assert out["level"].min() > 0.5  # nunca baja más de 0.2 desde 0.7
    assert (out["outlook"] != "negative").all()
    assert not out["event"].any() or out["event"].sum() == 1  # un bache puede ser evento, nunca dos


def test_persistent_deterioration_lowers_level_and_turns_negative_on_third_red():
    ranks = [0.7] * 12 + [0.1] * 6
    out = _score_ranked(_ranked_series("det", ranks)).set_index("month")
    assert out.loc["2026-08", "level"] < 0.2
    assert out.loc["2026-08", "score"] < out.loc["2026-02", "score"] - 40
    assert out.loc["2026-04", "outlook"] == "stable"
    assert out.loc["2026-05", "outlook"] == "negative"  # tercer rojo
    assert out.loc["2026-03", "event"]


# --- proyección a t+6 (slice 14, #31) -----------------------------------------------------


def test_fit_projection_quantiles_are_ordered_in_range_and_rise_with_level():
    m = rules.fit(_train_table(n=600), RulesConfig(), train_until="2025-08")
    assert m.projection_edges is not None and m.projection_points is not None
    assert len(m.projection_points) == len(m.projection_edges) - 1 >= 2
    for p10, p50, p90 in m.projection_points:
        assert 0 <= p10 <= p50 <= p90 <= 100
    p50s = [p[1] for p in m.projection_points]
    assert p50s[-1] > p50s[0]  # la etiqueta sube con el nivel: el centro del abanico también
    proj = m.project(np.array([0.05, 0.5, 0.95, np.nan]))
    assert proj.shape == (4, 3)
    assert proj[2, 1] >= proj[0, 1]
    assert np.isnan(proj[3]).all()


def test_projection_depends_on_the_level_bin_not_on_recent_score_history():
    m = rules.fit(_train_table(n=600), RulesConfig(), train_until="2025-08")
    rising = _series("a", [0.2, 0.3, 0.4, 0.5, 0.6, 0.7], "state_index", n_red=0, months_of_history=6, n_signals=4)
    falling = _series("b", [0.7, 0.6, 0.5, 0.4, 0.3, 0.2], "state_index", n_red=0, months_of_history=6, n_signals=4)
    out = rules.score(pd.concat([rising, falling], ignore_index=True), m)
    last = out.groupby("company_id").tail(1).set_index("company_id")
    assert last.loc["a", "level"] == pytest.approx(last.loc["b", "level"])  # mismo nivel, historial opuesto
    for col in rules.PROJECTION_COLUMNS:
        assert last.loc["a", col] == pytest.approx(last.loc["b", col])
    assert (out["proj_p10"] <= out["proj_p50"]).all() and (out["proj_p50"] <= out["proj_p90"]).all()


def test_projection_quantiles_never_fall_as_the_level_rises():
    """El mapa isotónico existe para que más nivel no dé menos score; el abanico, que se dibuja al
    lado del score, hereda la regla aunque la etiqueta de un tramo se hunda."""
    dipped = _train_table(n=600)
    dip = dipped["level"].between(0.5, 0.6)
    dipped.loc[dip, "label_t6"] = dipped.loc[dip, "label_t6"] - 0.3  # un tramo con la etiqueta baja
    for train in (dipped, _train_table(n=600)):
        pts = np.asarray(rules.fit(train, RulesConfig(), train_until="2025-08").projection_points)
        for col, name in enumerate(rules.PROJECTION_COLUMNS):
            assert np.all(np.diff(pts[:, col]) >= 0), name


def test_model_without_projection_does_not_load_silently(tmp_path):
    m = rules.fit(_train_table(), RulesConfig(), train_until="2025-08")
    raw = json.loads(json.dumps(asdict(m)))
    raw.pop("projection_edges")
    raw.pop("projection_points")
    path = tmp_path / "old_model.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="proyección"):
        RulesModel.load(path)


def test_model_with_inconsistent_projection_does_not_load(tmp_path):
    m = rules.fit(_train_table(), RulesConfig(), train_until="2025-08")
    raw = json.loads(json.dumps(asdict(m)))
    raw["projection_points"] = raw["projection_points"][:-1]  # un tramo menos que cortes
    path = tmp_path / "half_model.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ValueError, match="inconsistente"):
        RulesModel.load(path)
