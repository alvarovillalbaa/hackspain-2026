"""Tests de xray.evals al seam (docs/rules_spec.md §8): tablas pequeñas, resultado esperado."""

import json

import numpy as np
import pandas as pd
import pytest

from xray import evals, features, labels, rules
from xray.rules import RulesConfig


def _scored(company: str, score: list[float], event_at: list[int] = (), n_red: list[int] | None = None,
            start: str = "2025-01", min_balance: list[float] | None = None) -> pd.DataFrame:
    n = len(score)
    months = [str(p) for p in pd.period_range(start, periods=n, freq="M")]
    event = np.zeros(n, dtype=bool)
    event[list(event_at)] = True
    in_event = event.copy()
    df = pd.DataFrame({"company_id": company, "month": months, "score": score, "event": event,
                       "in_event": in_event, "n_red": n_red if n_red is not None else event.astype(int) * 2})
    df["level"] = df["score"] / 100
    df["outlook"] = "stable"
    df["trend"] = "flat"
    df["min_balance_eur"] = min_balance if min_balance is not None else 100.0
    return df


# --- AUC(h) -------------------------------------------------------------------------------


def test_auc_by_horizon_is_one_for_a_score_that_always_precedes_events():
    bad = _scored("bad", [80, 80, 20, 20, 20, 20, 20, 20], event_at=[5])  # cae 3 meses antes del evento
    good = _scored("good", [80] * 8)  # score alto, sin evento
    out = evals.auc_by_horizon(pd.concat([bad, good]), horizons=[1, 2, 3], test_months=None)
    assert list(out.index) == [1, 2, 3]
    assert out.loc[3, "auc"] == 1.0
    assert out.loc[3, "n_pos"] >= 1


def test_auc_excludes_rows_inside_an_event_and_rows_without_future():
    df = _scored("a", [50] * 6, event_at=[2])
    df.loc[2:3, "in_event"] = True
    out = evals.auc_by_horizon(df, horizons=[1], test_months=None)
    # 6 filas − 2 dentro de evento − 1 sin t+1 = 3 filas usadas
    assert out.loc[1, "n"] == 3


def test_auc_is_nan_when_only_one_class():
    df = _scored("a", [50] * 6)
    out = evals.auc_by_horizon(df, horizons=[1], test_months=None)
    assert np.isnan(out.loc[1, "auc"])


def test_auc_restricts_to_test_months():
    df = _scored("a", [50] * 6, event_at=[5])
    out = evals.auc_by_horizon(df, horizons=[1], test_months=["2025-05"])
    assert out.loc[1, "n"] == 1  # solo 2025-05: fuera de evento y con t+1


# --- AUC externa: el saldo bruto pasa a negativo ---------------------------------------------


def test_auc_external_uses_the_raw_balance_turning_negative():
    bad = _scored("bad", [80, 80, 20, 20, 20, 20, 20, 20], min_balance=[10, 10, 10, 10, 10, -5, -5, 10])
    good = _scored("good", [80] * 8)
    out = evals.auc_external_by_horizon(pd.concat([bad, good]), horizons=[1, 3], test_months=None)
    assert out.loc[3, "auc"] == 1.0
    assert out.loc[3, "n_pos"] == 3  # t = 2, 3, 4 de "bad": saldo ≥ 0 hoy y negativo en (t, t+3]


# --- lead time ----------------------------------------------------------------------------


def test_lead_time_is_months_between_crossing_and_event():
    df = _scored("a", [60, 60, 30, 30, 30, 60, 60], event_at=[4])
    lt = evals.lead_time(df, cutoff=40.0, hold=2)
    assert list(lt["lead_months"]) == [2]  # último mes por encima: 2025-02; cruza en 03; evento en 05
    assert list(lt["kind"]) == ["crossing"]


def test_lead_time_classifies_late_chronic_and_no_history():
    late = _scored("a", [60, 30, 60, 60, 30, 30], event_at=[5])  # cruza un mes antes del evento
    assert evals.lead_time(late, cutoff=40.0)[["lead_months", "kind"]].iloc[0].tolist() == [1, "late"]
    never = _scored("b", [60] * 6, event_at=[5])  # nunca bajó del corte antes del evento
    assert evals.lead_time(never, cutoff=40.0)[["lead_months", "kind"]].iloc[0].tolist() == [0, "late"]
    chronic = evals.lead_time(_scored("c", [30] * 6, event_at=[5]), cutoff=40.0).iloc[0]
    assert np.isnan(chronic["lead_months"]) and chronic["kind"] == "chronic"
    assert evals.lead_time(_scored("d", [30] * 3, event_at=[0]), cutoff=40.0)["kind"].iloc[0] == "no_history"


def test_lead_time_summary_reports_shares_and_median_among_crossings():
    lt = pd.DataFrame({"company_id": list("abcd"), "event_month": ["2025-05"] * 4,
                       "lead_months": [4.0, 6.0, np.nan, 1.0],
                       "kind": ["crossing", "crossing", "chronic", "late"]})
    s = evals.lead_time_summary(lt)
    assert (s["n_events"], s["share_crossing"], s["share_chronic"], s["share_late"]) == (4, 0.5, 0.25, 0.25)
    assert s["median_crossing"] == 5.0


# --- persistencia -------------------------------------------------------------------------


def test_persistence_probabilities_and_horizon():
    # rojo persistente: siempre que t es rojo, t+1 y t+2 también
    df = _scored("a", [50] * 8, n_red=[0, 2, 2, 2, 2, 0, 0, 0])
    p = evals.persistence(df, k_max=2, cfg=RulesConfig())
    assert p.loc[1, "p_red_given_red"] == pytest.approx(3 / 4)
    assert p.loc[1, "base_rate"] == pytest.approx(4 / 8)
    assert evals.persistence_horizon(p, min_lift=1.4) == 1


# --- direccionalidad ----------------------------------------------------------------------


def test_directionality_returns_spearman_and_persistence_by_outlook_and_trend():
    rng = np.random.default_rng(0)
    df = _scored("a", list(rng.uniform(20, 80, 20)), n_red=[0] * 10 + [2] * 10)
    df.loc[10:, "outlook"] = "negative"
    df.loc[5:, "trend"] = "worsening"
    out = evals.directionality(df, test_months=None)
    assert {"spearman", "n", "p_red_t6_given_negative", "p_red_t6_given_stable",
            "p_red_t6_given_worsening"} <= set(out)
    assert -1 <= out["spearman"] <= 1
    assert out["p_red_t6_given_negative"] == pytest.approx(1.0)  # t = 10…13 son rojos y t+6 también


# --- métricas a fichero -------------------------------------------------------------------


def test_write_metrics_merges_by_model_name(tmp_path):
    path = tmp_path / "metrics.json"
    evals.write_metrics({"auc": {"6": 0.7}}, "rules", path)
    evals.write_metrics({"auc": {"6": 0.8}}, "gbm", path)
    data = json.loads(path.read_text())
    assert set(data) == {"rules", "gbm"}
    assert data["rules"]["auc"]["6"] == 0.7


# --- proyección a 6 meses -----------------------------------------------------------------


def test_projection_metrics_coverage_and_martingale_baseline():
    df = _scored("a", [50.0] * 12)  # score plano: el futuro cae siempre dentro de [40, 60]
    df["proj_p10"], df["proj_p50"], df["proj_p90"] = 40.0, 50.0, 60.0
    df["months_of_history"] = range(1, 13)
    out = evals.projection_metrics(df, test_months=None, train_until="2025-06")
    assert out["n"] == 6  # 12 filas − 6 sin t+6
    assert out["coverage_80"] == 1.0 and out["mae_p50"] == 0.0 and out["mean_width"] == 20.0
    assert out["pinball"] == pytest.approx((0.1 * 10 + 0.0 + 0.1 * 10) / 3)
    assert out["martingale_baseline"]["coverage_80"] == 1.0  # Δ6 = 0 en train: el abanico base es el score de hoy
    assert out["coverage_80_by_outlook"]["stable"] == 1.0
    assert out["coverage_80_by_history"]["lt_6"] == 1.0


def test_projection_metrics_report_misses_and_empty_test():
    df = _scored("a", [50.0] * 8)
    df["proj_p10"], df["proj_p50"], df["proj_p90"] = 60.0, 70.0, 80.0  # abanico por encima del futuro
    out = evals.projection_metrics(df, test_months=None, train_until="2025-02")
    assert out["coverage_80"] == 0.0 and out["mae_p50"] == 20.0
    assert evals.projection_metrics(df, test_months=["2030-01"], train_until="2025-02") == {"n": 0}


# --- watch -------------------------------------------------------------------------------


def test_watch_metrics_measure_red_within_three_months_with_and_without_watch():
    df = _scored("a", [50.0] * 10, n_red=[0, 0, 0, 0, 2, 2, 0, 0, 0, 0])
    df["watch"] = [None, "large_maturity", "large_maturity", "large_maturity", None, None, None, None, None, None]
    out = evals.watch_metrics(df, test_months=None)
    # el denominador es el de las filas evaluables {0,1,2,3,6}: no rojas en t y con 3 meses siguientes
    assert out["share_rows_with_watch"] == pytest.approx(0.6)
    assert out["n_watch"] == 3 and out["p_red_3m_given_watch"] == 1.0  # t = 1, 2, 3 ven el rojo de t = 4
    assert out["p_red_3m_given_no_watch"] == 0.0  # t = 0 y t = 6 no ven ningún rojo en (t, t+3]
    assert out["kinds"] == {"large_maturity": 3}  # meses con watch activo, ~3 por evento
    assert evals.watch_metrics(df.drop(columns=["watch"]), test_months=None)["n_watch"] == 0


# --- CLI sobre la fixture -----------------------------------------------------------------


def test_cli_runs_on_fixture_and_writes_artifacts(tmp_path):
    out_dir = tmp_path / "evals"
    rc = evals.main(["--features", str(features.FIXTURE_PATH), "--out-dir", str(out_dir), "--name", "rules"])
    assert rc == 0
    metrics = json.loads((out_dir / "metrics.json").read_text())["rules"]
    for key in ("auc_by_horizon", "auc_external_by_horizon", "lead_time", "persistence", "directionality",
                "projection", "watch", "trend_share", "n_events", "n_rows"):
        assert key in metrics, key
    assert set(metrics["lead_time"]) >= {"share_crossing", "share_chronic", "share_late", "median_crossing", "cutoff"}
    assert (out_dir / "rules_model.json").exists()


# --- GroupKFold ---------------------------------------------------------------------------


def test_group_kfold_auc6_returns_one_row_per_fold():
    rng = np.random.default_rng(1)
    parts = []
    for i in range(6):
        n_red = [0] * 18
        if i % 2 == 0:
            n_red[12:16] = [2, 2, 2, 2]
        c = _scored(f"c{i}", list(rng.uniform(20, 80, 18)), n_red=n_red, start="2024-09")
        c["state_index"] = c["level"]
        c["label_t6"] = c.groupby("company_id")["state_index"].transform(
            lambda s: pd.concat([s.shift(-k) for k in range(1, 7)], axis=1).mean(axis=1)
        )
        parts.append(c.drop(columns=["score", "event", "in_event"]))
    indexed = pd.concat(parts, ignore_index=True)
    groups = pd.Series({f"c{i}": f"g{i % 3}" for i in range(6)})
    out = evals.group_kfold_auc6(indexed, groups, RulesConfig(), train_until="2025-08", n_splits=3)
    assert len(out) == 3
    assert set(out.columns) >= {"fold", "auc6", "n_test_rows"}
    assert out["auc6"].dropna().between(0, 1).all()


# --- fiabilidad ---------------------------------------------------------------------------


def test_reliability_is_exact_when_the_label_equals_the_score():
    rng = np.random.default_rng(2)
    scores = list(rng.uniform(20, 70, 40))
    df = pd.concat([_scored("a", scores[:20]), _scored("b", scores[20:])], ignore_index=True)
    df["label_t6"] = df["score"] / 100  # etiqueta exactamente igual al score → sin desvío ni bajadas
    out = evals.reliability(df, test_months=None, n_bins=5)
    assert out["n"] == 40 and len(out["by_score_decile"]) == 5 and len(out["by_level_decile"]) == 5
    assert out["mean_abs_gap"] == pytest.approx(0.0)
    assert out["dips"] == 0 and out["largest_dip"] > 0
    assert [r["n"] for r in out["by_score_decile"]] == [8] * 5


def test_reliability_counts_a_raw_dip_and_handles_too_few_rows():
    df = _scored("a", [10, 20, 30, 40, 50, 60])
    df["label_t6"] = [0.1, 0.2, 0.3, 0.6, 0.4, 0.3]  # terciles de nivel: 15 → 45 → 35, una bajada de 10
    out = evals.reliability(df, test_months=None, n_bins=3)
    assert out["dips"] == 1 and out["largest_dip"] == pytest.approx(-10.0)
    assert evals.reliability(df.head(2), test_months=None, n_bins=3)["by_score_decile"] == []


# --- PD6, estabilidad y comparación con los retadores -----------------------------------------


def _pd6_table() -> pd.DataFrame:
    """Dos empresas, 9 meses. `a` entra en rotura en 2025-08 (negativa desde 2025-07); `b` nunca.
    `score` ordena bien, `bad` ordena al revés."""
    months = [str(p) for p in pd.period_range("2025-01", periods=9, freq="M")]
    rows = []
    for m in months:
        rows.append({"company_id": "a", "month": m, "min_balance_eur": -1.0 if m >= "2025-07" else 1.0,
                     "months_negative_6m": 0, "score": 60.0 if m == "2025-01" else 30.0,
                     "bad": 10.0 if m == "2025-01" else 90.0})
        rows.append({"company_id": "b", "month": m, "min_balance_eur": 1.0,
                     "months_negative_6m": 0, "score": 80.0, "bad": 20.0})
    return labels.label_pd6(pd.DataFrame(rows))


def test_auc_pd6_uses_breach_entry_and_eligibility():
    t = _pd6_table()
    good = evals.auc_pd6_by_horizon(t, "score", horizons=[6], test_months=None)
    bad = evals.auc_pd6_by_horizon(t, "bad", horizons=[6], test_months=None)
    assert good.loc[6, "auc"] == 1.0 and bad.loc[6, "auc"] == 0.0
    assert good.loc[6, "n_pos"] == 5  # a: 2025-02..2025-06 ven la entrada de 2025-08 en (t, t+6]
    assert good.loc[6, "n"] == 5 + 1 + 3  # a 2025-01 (0, t+6 = 2025-07 presente) + b 2025-01..03


def test_auc_pd6_clean_subset_drops_recent_negatives():
    t = _pd6_table()
    t.loc[(t["company_id"] == "b") & (t["month"] <= "2025-02"), "months_negative_6m"] = 1
    full = evals.auc_pd6_by_horizon(t, "score", horizons=[6], test_months=None)
    clean = evals.auc_pd6_by_horizon(t, "score", horizons=[6], test_months=None, clean=True)
    assert clean.loc[6, "n"] == full.loc[6, "n"] - 2


def test_stability_of_a_frozen_ranking_is_perfect():
    months = [str(p) for p in pd.period_range("2025-01", periods=4, freq="M")]
    rows = [{"company_id": c, "month": m, "score": s} for m in months for c, s in zip("abcde", [10, 20, 30, 40, 50])]
    st = evals.stability(pd.DataFrame(rows), "score", test_months=months[1:])
    assert st["spearman_month_to_month"] == pytest.approx(1.0) and st["jump_rate_2_deciles"] == 0.0


def test_stability_counts_jumps_of_two_deciles():
    months = ["2025-01", "2025-02"]
    scores = {"2025-01": list(range(10, 110, 10)), "2025-02": list(range(10, 110, 10))}
    scores["2025-02"][0], scores["2025-02"][-1] = 100, 10  # la primera y la última se intercambian
    rows = [{"company_id": f"c{i}", "month": m, "score": scores[m][i]} for m in months for i in range(10)]
    st = evals.stability(pd.DataFrame(rows), "score", test_months=["2025-02"])
    assert st["jump_rate_2_deciles"] == pytest.approx(0.2)
    assert st["spearman_month_to_month"] < 1.0


def _synthetic_contract(n_companies: int = 120, months: int = 24, seed: int = 5) -> pd.DataFrame:
    """Misma construcción que tests/unit/test_challenger.py::_synthetic (duplicada para no importar tests)."""
    rng = np.random.default_rng(seed)
    rows = []
    periods = [str(p) for p in pd.period_range("2024-09", periods=months, freq="M")]
    for i in range(n_companies):
        frailty = rng.normal()
        for k, m in enumerate(periods):
            buffer = 20 + 15 * frailty + rng.normal(scale=5)
            rows.append({
                "company_id": f"c{i:03d}", "month": m, "months_of_history": k + 1,
                "operating_inflows_eur": 1e5, "outflows_eur": 9e4,
                "min_balance_eur": buffer * 3e3, "months_negative_6m": 0,
                "cash_buffer_days": buffer, "overdue_flow_rate_3m": rng.uniform(0, 0.5),
                "dscr_6m": 4 + frailty, "net_cash_flow_ratio_3m": 0.1 * frailty,
                "credit_line_usage": rng.uniform(0, 1), "top_customer_share_12m": 0.3,
            })
    return pd.DataFrame(rows)


def test_compare_challenger_reports_every_candidate_and_a_verdict():
    f = _synthetic_contract()
    scored = rules.run(f, train_until="2026-01")
    groups = pd.Series({c: f"g{i % 7}" for i, c in enumerate(f["company_id"].unique())})
    months = [str(p) for p in pd.period_range("2026-02", "2026-04", freq="M")]
    m, models, out = evals.compare_challenger(scored, groups, train_until="2026-01", test_months=months)
    from xray import challenger

    kinds = set(challenger.KINDS)
    for who in {"rules"} | kinds:
        assert set(m[who]) >= {"auc_pd6_by_horizon", "auc6_clean", "auc6_strict", "stability", "auc6_group_kfold"}
        assert m[who]["auc6_group_kfold"] is not None
    assert set(m["verdict"]) == kinds
    assert all(isinstance(v["challenger_wins"], bool) for v in m["verdict"].values())
    assert set(models) == kinds and models["gbm"].n_pos > 0
    assert {f"score_{k}" for k in kinds} <= set(out.columns)
    assert all("feature_importance" in m[k] for k in kinds)
    assert models["scorecard"].feature_names == list(challenger.COMPACT_FEATURES)
