"""Tests de xray.ope al seam (experimento C1): logs pequeños a mano y un bandit sintético.

El bandit tiene valor verdadero conocido, así que los estimadores se comparan contra él en vez
de contra su propia implementación.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from xray import ope

N = 5_000
N_ACTIONS = 3
SEED = 0


# --- log de tres filas calculado a mano ----------------------------------------------------


def _tiny_log() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "x": [0.1, 0.2, 0.3],
            "action": [0, 1, 0],
            "propensity": [0.5, 0.25, 0.8],
            "reward": [1.0, 2.0, -1.0],
        }
    )


# w = π_e(a|x)/π_b(a|x) = [0.5/0.5, 0.5/0.25, 0.4/0.8] = [1, 2, 0.5]
TINY_TARGET = np.array([[0.5, 0.5], [0.5, 0.5], [0.4, 0.6]])
TINY_Q = np.array([[0.8, 0.0], [0.0, 1.0], [-0.5, 1.0]])


def test_ips_is_the_mean_of_the_weighted_rewards():
    # (1·1 + 2·2 + 0.5·(−1)) / 3
    assert ope.ips(_tiny_log(), TINY_TARGET) == pytest.approx(4.5 / 3)


def test_snips_normalises_by_the_sum_of_weights():
    # 4.5 / (1 + 2 + 0.5)
    assert ope.snips(_tiny_log(), TINY_TARGET) == pytest.approx(4.5 / 3.5)


def test_dm_averages_q_hat_under_the_target_policy():
    # fila a fila: 0.5·0.8, 0.5·1.0, 0.4·(−0.5) + 0.6·1.0 = 0.4, 0.5, 0.4
    assert ope.dm(_tiny_log(), TINY_TARGET, TINY_Q) == pytest.approx(1.3 / 3)


def test_dr_adds_the_weighted_residual_to_dm():
    # fila a fila: 0.4 + 1·(1.0 − 0.8), 0.5 + 2·(2.0 − 1.0), 0.4 + 0.5·(−1.0 + 0.5)
    assert ope.dr(_tiny_log(), TINY_TARGET, TINY_Q) == pytest.approx(3.25 / 3)


def test_dr_collapses_to_ips_when_q_hat_is_zero():
    log = _tiny_log()
    zeros = np.zeros_like(TINY_Q)
    assert ope.dr(log, TINY_TARGET, zeros) == pytest.approx(ope.ips(log, TINY_TARGET))


def test_effective_sample_size_of_the_tiny_log():
    # (3.5)² / (1 + 4 + 0.25)
    assert ope.effective_sample_size(_tiny_log(), TINY_TARGET) == pytest.approx(12.25 / 5.25)


@pytest.mark.parametrize("bad", [0.0, -0.1, float("nan")])
def test_a_non_positive_propensity_is_an_error(bad):
    log = _tiny_log()
    log.loc[1, "propensity"] = bad
    with pytest.raises(ValueError, match="propensity"):
        ope.ips(log, TINY_TARGET)


def test_target_probs_with_the_wrong_number_of_rows_is_an_error():
    with pytest.raises(ValueError, match="target_probs"):
        ope.ips(_tiny_log(), TINY_TARGET[:2])


def test_q_hat_with_a_shape_that_does_not_match_target_probs_is_an_error():
    with pytest.raises(ValueError, match="q_hat"):
        ope.dm(_tiny_log(), TINY_TARGET, TINY_Q[:, :1])


def test_an_action_outside_the_range_of_target_probs_is_an_error():
    log = _tiny_log()
    log.loc[0, "action"] = 7
    with pytest.raises(ValueError, match="action"):
        ope.ips(log, TINY_TARGET)


def test_snips_needs_some_overlap_between_the_two_policies():
    with pytest.raises(ValueError, match="solapa"):
        ope.snips(_tiny_log(), np.zeros((3, 2)))


def test_effective_sample_size_is_zero_without_overlap():
    assert ope.effective_sample_size(_tiny_log(), np.zeros((3, 2))) == 0.0


def test_fit_reward_model_needs_enough_rows_for_two_folds():
    with pytest.raises(ValueError, match="cross-fitting"):
        ope.fit_reward_model(_tiny_log().head(1), ["x"], 2)


def test_bootstrap_ci_needs_at_least_one_replicate():
    with pytest.raises(ValueError, match="n_boot"):
        ope.bootstrap_ci(ope.ips, _tiny_log(), TINY_TARGET, n_boot=0)


# --- bandit sintético con verdad conocida --------------------------------------------------


def _true_q(x: np.ndarray) -> np.ndarray:
    """Recompensa media verdadera r(x, a) = a·x − 0.3·a, en una matriz (n, A)."""
    actions = np.arange(N_ACTIONS)
    return x[:, None] * actions - 0.3 * actions


def _softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


@pytest.fixture(scope="module")
def bandit() -> dict:
    """Log de 5 000 filas: x ~ U(0,1), política de registro softmax(2·r), ruido N(0, 0.1)."""
    rng = np.random.default_rng(SEED)
    x = rng.uniform(0.0, 1.0, N)
    q_true = _true_q(x)
    behaviour = _softmax(2.0 * q_true)
    draw = rng.random(N)
    action = np.minimum((behaviour.cumsum(axis=1) < draw[:, None]).sum(axis=1), N_ACTIONS - 1)
    rows = np.arange(N)
    reward = q_true[rows, action] + rng.normal(0.0, 0.1, N)
    log = pd.DataFrame(
        {"x": x, "action": action, "propensity": behaviour[rows, action], "reward": reward}
    )
    best = q_true.argmax(axis=1)
    return {
        "log": log,
        "target": np.eye(N_ACTIONS)[best],  # política objetivo determinista (argmax)
        "behaviour": behaviour,
        "q_true": q_true,
        "truth": float(q_true[rows, best].mean()),  # Monte Carlo sobre los mismos contextos
    }


@pytest.fixture(scope="module")
def q_hat(bandit) -> np.ndarray:
    return ope.fit_reward_model(bandit["log"], ["x"], N_ACTIONS, seed=SEED)


def test_ips_recovers_the_true_value(bandit):
    assert abs(ope.ips(bandit["log"], bandit["target"]) - bandit["truth"]) < 0.05


def test_snips_recovers_the_true_value(bandit):
    assert abs(ope.snips(bandit["log"], bandit["target"]) - bandit["truth"]) < 0.05


def test_dm_with_the_true_q_equals_the_true_value(bandit):
    assert abs(ope.dm(bandit["log"], bandit["target"], bandit["q_true"]) - bandit["truth"]) < 0.02


def test_dr_recovers_the_true_value_with_a_fitted_reward_model(bandit, q_hat):
    assert abs(ope.dr(bandit["log"], bandit["target"], q_hat) - bandit["truth"]) < 0.03


def test_fit_reward_model_returns_a_matrix_close_to_the_true_q(bandit, q_hat):
    assert q_hat.shape == (N, N_ACTIONS)
    assert np.abs(q_hat - bandit["q_true"]).mean() < 0.1


def test_fit_reward_model_is_deterministic_for_a_given_seed(bandit, q_hat):
    again = ope.fit_reward_model(bandit["log"], ["x"], N_ACTIONS, seed=SEED)
    assert np.array_equal(again, q_hat)


def test_effective_sample_size_is_below_n_for_a_deterministic_target(bandit):
    ess = ope.effective_sample_size(bandit["log"], bandit["target"])
    assert 0 < ess < N


def test_effective_sample_size_equals_n_when_the_target_is_the_behaviour_policy(bandit):
    ess = ope.effective_sample_size(bandit["log"], bandit["behaviour"])
    assert ess == pytest.approx(N)


# --- bootstrap -----------------------------------------------------------------------------


def test_bootstrap_ci_brackets_the_true_value_and_repeats_with_the_same_seed(bandit):
    lo, hi = ope.bootstrap_ci(ope.snips, bandit["log"], bandit["target"], n_boot=200, seed=SEED)
    assert lo < bandit["truth"] < hi
    assert hi - lo < 0.2
    assert (lo, hi) == ope.bootstrap_ci(
        ope.snips, bandit["log"], bandit["target"], n_boot=200, seed=SEED
    )


def test_bootstrap_ci_resamples_q_hat_alongside_the_log():
    """Con q̂ perfecto el residuo es cero y DR devuelve la media de x en cada réplica.

    Si el bootstrap no reordenara q̂ con el log, la réplica sería 2·x_i − x_j y el intervalo
    no coincidiría con el de IPS sobre las mismas filas remuestreadas.
    """
    n = 200
    x = np.arange(n, dtype=float)
    weighted = pd.DataFrame({"x": x, "action": 0, "propensity": 0.5, "reward": x})
    plain = weighted.assign(propensity=1.0)
    target = np.tile([1.0, 0.0], (n, 1))
    q = np.column_stack([x, np.zeros(n)])
    with_q = ope.bootstrap_ci(ope.dr, weighted, target, n_boot=200, seed=SEED, q_hat=q)
    assert with_q == ope.bootstrap_ci(ope.ips, plain, target, n_boot=200, seed=SEED)


# --- potencia ------------------------------------------------------------------------------


def test_power_two_proportions_for_five_versus_three_percent():
    assert 1_400 < ope.power_two_proportions(0.05, 0.03) < 1_600


def test_power_two_proportions_is_symmetric_in_its_arms():
    assert ope.power_two_proportions(0.03, 0.05) == ope.power_two_proportions(0.05, 0.03)


def test_power_two_proportions_grows_when_the_effect_shrinks():
    assert ope.power_two_proportions(0.05, 0.04) > ope.power_two_proportions(0.05, 0.03)


def test_power_two_proportions_needs_two_different_rates():
    with pytest.raises(ValueError):
        ope.power_two_proportions(0.05, 0.05)


def test_n_offers_for_power_covers_both_arms_out_of_the_randomised_share():
    per_arm = ope.power_two_proportions(0.05, 0.03)
    assert ope.n_offers_for_power(0.05, 0.03, 0.1) == math.ceil(2 * per_arm / 0.1)


def test_n_offers_for_power_needs_a_share_between_zero_and_one():
    with pytest.raises(ValueError, match="epsilon"):
        ope.n_offers_for_power(0.05, 0.03, 0.0)
