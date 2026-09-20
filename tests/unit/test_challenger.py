"""Tests de xray.challenger al seam: tabla indexada → PD monótona, suavizada, persistible."""

import numpy as np
import pandas as pd
import pytest

from xray import challenger, features as features_mod, labels, rules


def _synthetic(n_companies: int = 60, months: int = 20, seed: int = 0) -> pd.DataFrame:
    """Tabla del contrato sintética con rotura ligada al colchón de caja, para que haya señal."""
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


def _indexed(f: pd.DataFrame) -> pd.DataFrame:
    df = labels.rank_signals(f)
    df = labels.state_index(df)
    df = rules.level(df)
    return labels.label_pd6(df)


def test_design_matrix_has_every_declared_feature_as_float():
    x = challenger.design_matrix(_indexed(_synthetic()))
    assert list(x.columns) == list(challenger.FEATURES)
    assert all(np.issubdtype(t, np.floating) for t in x.dtypes)
    assert "momentum" in x.columns and "log_outflows" in x.columns


def test_fit_refuses_without_positives():
    df = _indexed(_synthetic())
    df["label_pd6"] = 0.0
    with pytest.raises(ValueError, match="positiv"):
        challenger.fit(df, train_until="2026-04")


def test_pd_is_monotone_in_cash_buffer_rank():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=1))
    model = challenger.fit(df, train_until="2026-04")
    probe = df[df["month"] == "2026-01"].head(1).copy()
    probe = pd.concat([probe] * 5, ignore_index=True)
    probe["rank_balance"] = [0.1, 0.3, 0.5, 0.7, 0.9]
    pd6 = model.predict_pd6(probe)
    assert np.all(np.diff(pd6) <= 1e-12)  # más colchón → PD no sube


def test_score_smooths_over_three_months_per_company():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=2))
    model = challenger.fit(df, train_until="2026-04")
    out = challenger.score(df, model).sort_values(["company_id", "month"])
    one = out[out["company_id"] == "c000"]
    expected = one["pd6_raw"].rolling(3, min_periods=1).mean()
    assert np.allclose(one["pd6"].to_numpy(), expected.to_numpy())
    assert np.allclose(out["challenger_score"], 100 * (1 - out["pd6"]))
    assert out["challenger_score"].between(0, 100).all()


def test_strict_split_uses_only_labels_closed_inside_train():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=3))
    loose = challenger.fit(df, train_until="2026-04")
    strict = challenger.fit(df, challenger.ChallengerConfig(strict=True), train_until="2026-04")
    assert strict.n_train < loose.n_train
    assert strict.train_until == "2026-04"


def test_logistic_kind_is_a_readable_scorecard():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=6))
    model = challenger.fit(df, challenger.ChallengerConfig(kind="logistic"), train_until="2026-04")
    pd6 = model.predict_pd6(df)
    assert np.all((pd6 >= 0) & (pd6 <= 1))
    imp = model.feature_importance()
    assert list(imp.index) == list(challenger.FEATURES)
    # las columnas sintéticas son colineales (dscr e inflows comparten frailty), así que un solo
    # coeficiente puede cambiar de signo; lo que tiene que ser legible es la dirección del conjunto
    assert imp["dscr_6m"] < 0 and imp["net_cash_flow_ratio_3m"] < 0
    assert pd.Series(pd6).corr(df["cash_buffer_days"].reset_index(drop=True), method="spearman") < 0


def test_gbm_feature_importance_is_nonnegative_gain():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=7))
    imp = challenger.fit(df, train_until="2026-04").feature_importance()
    assert (imp >= 0).all() and imp.sum() > 0


def test_save_and_load_round_trip(tmp_path):
    df = _indexed(_synthetic(n_companies=120, months=24, seed=4))
    model = challenger.fit(df, train_until="2026-04")
    path = tmp_path / "challenger.joblib"
    model.save(path)
    again = challenger.ChallengerModel.load(path)
    assert np.allclose(again.predict_pd6(df), model.predict_pd6(df), equal_nan=True)
    assert again.feature_names == model.feature_names


def test_fixture_without_enough_positives_is_a_clear_error_not_a_crash():
    f = features_mod.load_fixture()
    df = labels.label_pd6(rules.run(f))
    with pytest.raises(ValueError, match="positiv"):
        challenger.fit(df)  # 3 empresas: 5 positivos < min_positives


def test_scorecard_kind_uses_the_compact_feature_set():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=8))
    model = challenger.fit(df, challenger.ChallengerConfig(kind="scorecard"), train_until="2026-04")
    assert model.feature_names == list(challenger.COMPACT_FEATURES)
    imp = model.feature_importance()
    assert list(imp.index) == list(challenger.COMPACT_FEATURES)
    assert imp["rank_balance"] < 0  # sin colineales, el signo del colchón es el esperado
    assert np.all((model.predict_pd6(df) >= 0) & (model.predict_pd6(df) <= 1))


def test_explicit_feature_subset_is_respected_by_gbm():
    df = _indexed(_synthetic(n_companies=120, months=24, seed=9))
    cfg = challenger.ChallengerConfig(features=("rank_balance", "months_negative_6m"))
    model = challenger.fit(df, cfg, train_until="2026-04")
    assert model.feature_names == ["rank_balance", "months_negative_6m"]
