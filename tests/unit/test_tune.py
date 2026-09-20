"""Tests de xray.tune al seam: rejilla de pesos, índice renormalizado y CV anidada.

Sin dataset: tablas sintéticas pequeñas (60 empresas, 20 meses, 4 grupos) construidas igual que
en `test_challenger.py`, para que la rotura de caja siga al colchón de caja y haya señal.
"""

import numpy as np
import pandas as pd

from xray import labels, rules, tune


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


def _groups(o: pd.DataFrame) -> pd.Series:
    companies = sorted(o["company_id"].unique())
    return pd.Series({c: f"g{i % 4}" for i, c in enumerate(companies)})


def test_weight_grid_covers_the_simplex():
    grid = tune.weight_grid(0.5)
    assert grid.shape == (10, 4)
    assert (grid >= 0).all()
    assert np.allclose(grid.sum(axis=1), 1.0)


def test_index_level_is_the_weighted_rank_before_smoothing():
    o = _indexed(_synthetic())
    one = tune.index_level(o, (1, 0, 0, 0), 1)
    assert np.allclose(one, o["rank_balance"].to_numpy(dtype=float), equal_nan=True)

    three = tune.index_level(o, (1, 0, 0, 0), 3)
    expected = (
        pd.Series(o["rank_balance"].to_numpy(dtype=float))
        .groupby(o["company_id"].to_numpy())
        .transform(lambda s: s.rolling(3, min_periods=1).mean())
        .to_numpy()
    )
    assert np.allclose(three, expected, equal_nan=True)


def test_index_level_renormalises_over_available_signals():
    o = pd.DataFrame({
        "company_id": ["a", "a", "b"],
        "month": ["2024-01", "2024-02", "2024-01"],
        "rank_balance": [0.9, 0.8, 0.7],
        "rank_inflows": [np.nan, np.nan, np.nan],
        "rank_dscr": [0.1, np.nan, np.nan],
        "rank_overdue": [np.nan, np.nan, np.nan],
    })
    out = tune.index_level(o, (0.5, 0.0, 0.5, 0.0), 1)
    assert out[0] == 0.5  # (0,9 + 0,1) / 2
    assert out[1] == 0.8  # dscr NaN: el peso 0,5 se renormaliza sobre balance
    assert out[2] == 0.7  # igual


def test_search_returns_one_row_per_candidate_and_prefers_balance_over_overdue():
    o = _indexed(_synthetic(seed=0))
    windows = (1, 6)
    res = tune.search(o, _groups(o), step=0.25, windows=windows)
    assert list(res.columns) == ["L", *tune.WEIGHT_COLS, "cv_ext", "cv_ext_sd", "cv_pd6"]
    assert len(res) == len(windows) * len(tune.weight_grid(0.25))
    defined = res["cv_ext"].dropna()
    assert ((defined >= 0) & (defined <= 1)).all()
    top = tune.best(res)
    assert top["w_balance"] > top["w_overdue"]


def test_best_respects_the_min_weight_and_window_filters():
    o = _indexed(_synthetic(seed=0))
    res = tune.search(o, _groups(o), step=0.25, windows=(1, 6))
    top = tune.best(res, min_weight=0.1)
    assert all(top[c] >= 0.1 for c in tune.WEIGHT_COLS)
    assert tune.best(res, window=6)["L"] == 6


def test_evaluate_returns_six_finite_metrics():
    o = _indexed(_synthetic(seed=0))
    ev = tune.evaluate(o, tune.PRODUCTION_WEIGHTS, tune.PRODUCTION_WINDOW)
    assert set(ev) == {"test_ext6", "test_pd6", "test_ext6_clean", "test_pd6_clean", "spearman", "jumps"}
    assert all(np.isfinite(v) for v in ev.values())


def test_compare_returns_the_picks_with_paired_intervals():
    o = _indexed(_synthetic(seed=0))
    out = tune.compare(o, _groups(o), n_boot=20, step=0.25, windows=(1, 6))
    expected = {
        "production", "production_L3", "production_L1", "equal", "balance_only",
        "cv_best", "cv_best_L6", "cv_best_min10", "cv_best_pd6",
    }
    assert set(out["picks"]) == expected
    assert len(out["search_top"]) == 20
    for name, pick in out["picks"].items():
        assert len(pick["weights"]) == 4
        if name != "production":
            assert len(pick["d_ext_ci"]) == 3
            assert len(pick["d_pd6_ci"]) == 3
