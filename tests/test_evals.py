"""Tests de xray.evals al seam (docs/rules_spec.md §8): tablas pequeñas, resultado esperado."""

import json

import numpy as np
import pandas as pd
import pytest

from xray import evals, features
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


# --- CLI sobre la fixture -----------------------------------------------------------------


def test_cli_runs_on_fixture_and_writes_artifacts(tmp_path):
    out_dir = tmp_path / "evals"
    rc = evals.main(["--features", str(features.FIXTURE_PATH), "--out-dir", str(out_dir), "--name", "rules"])
    assert rc == 0
    metrics = json.loads((out_dir / "metrics.json").read_text())["rules"]
    for key in ("auc_by_horizon", "auc_external_by_horizon", "lead_time", "persistence", "directionality",
                "trend_share", "n_events", "n_rows"):
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
