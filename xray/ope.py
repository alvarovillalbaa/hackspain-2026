"""Evaluación off-policy de políticas de recomendación de producto (experimento C1).

Un log de ofertas —contexto, acción ofrecida, propensión con la que se ofreció y recompensa
observada— solo dice qué pasó con la política que registró los datos. Estos estimadores
responden a la pregunta que importa antes de cambiar nada en producción: cuánto habría valido
una política distinta sobre ese mismo log.

    ips / snips   reponderación por importancia (w = π_e/π_b); insesgado pero con cola larga
    dm            modelo de recompensa q̂ evaluado bajo la política objetivo; poca varianza, sesgo
    dr            DM + el residuo reponderado; acierta si acierta q̂ **o** si acierta π_b

`effective_sample_size` dice cuántas filas «de verdad» sostienen la estimación (si cae mucho por
debajo de n, el log no solapa con la política objetivo y el número no vale), `bootstrap_ci` pone
intervalos alrededor de cualquiera de los estimadores y las dos funciones de potencia dimensionan
el experimento online que confirmaría el resultado.

El módulo es autocontenido: recibe DataFrames y arrays, no lee el dataset ni importa el resto de
`xray`. Convención del log: columnas `action` (int 0..A−1), `propensity` (π_b de la acción
registrada), `reward` (float) y las columnas de contexto que indique quien llame.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from scipy.stats import norm

ACTION = "action"
PROPENSITY = "propensity"
REWARD = "reward"


# --- validación y pesos de importancia -----------------------------------------------------


def _policy_probs(log: pd.DataFrame, target_probs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Devuelve (π_e como matriz (n, A) validada, acciones registradas como array de int)."""
    probs = np.asarray(target_probs, dtype=float)
    if probs.ndim != 2 or probs.shape[0] != len(log):
        raise ValueError(f"target_probs debe ser (n, A) con n={len(log)}; recibido {probs.shape}")
    action = log[ACTION].to_numpy(dtype=int)
    if action.size and (action.min() < 0 or action.max() >= probs.shape[1]):
        raise ValueError(f"action fuera de rango para A={probs.shape[1]} acciones")
    return probs, action


def _as_q(q_hat: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    q = np.asarray(q_hat, dtype=float)
    if q.shape != shape:
        raise ValueError(f"q_hat debe tener la forma de target_probs {shape}; recibido {q.shape}")
    return q


def _importance_weights(
    log: pd.DataFrame, target_probs: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Pesos w_i = π_e(a_i|x_i)/π_b(a_i|x_i) y recompensas observadas.

    Una propensión nula o negativa (o NaN) rompe la reponderación: el log no puede decir nada de
    una acción que su política nunca pudo ofrecer, así que es un error y no un infinito.
    """
    probs, action = _policy_probs(log, target_probs)
    behaviour = log[PROPENSITY].to_numpy(dtype=float)
    if not np.all(behaviour > 0):
        raise ValueError("propensity debe ser > 0 en todas las filas del log")
    rows = np.arange(len(log))
    return probs[rows, action] / behaviour, log[REWARD].to_numpy(dtype=float)


# --- estimadores ---------------------------------------------------------------------------


def ips(log: pd.DataFrame, target_probs: np.ndarray) -> float:
    """Inverse propensity scoring: media de w·r. Insesgado, pero la varianza sube con max(w)."""
    w, reward = _importance_weights(log, target_probs)
    return float(np.mean(w * reward))


def snips(log: pd.DataFrame, target_probs: np.ndarray) -> float:
    """IPS autonormalizado: Σ(w·r)/Σw. Un poco sesgado y bastante más estable que IPS."""
    w, reward = _importance_weights(log, target_probs)
    total = float(w.sum())
    if total <= 0:
        raise ValueError("la suma de pesos es 0: π_e no solapa con ninguna acción registrada")
    return float(np.sum(w * reward) / total)


def dm(log: pd.DataFrame, target_probs: np.ndarray, q_hat: np.ndarray) -> float:
    """Direct method: media de Σ_a π_e(a|x)·q̂(x, a). Hereda el sesgo del modelo de recompensa."""
    probs, _ = _policy_probs(log, target_probs)
    q = _as_q(q_hat, probs.shape)
    return float(np.mean((probs * q).sum(axis=1)))


def dr(log: pd.DataFrame, target_probs: np.ndarray, q_hat: np.ndarray) -> float:
    """Doubly robust: DM + media de w·(r − q̂(x, a)).

    El residuo corrige el sesgo de q̂ y q̂ recorta la varianza de la reponderación: basta con que
    uno de los dos modelos esté bien especificado.
    """
    probs, action = _policy_probs(log, target_probs)
    q = _as_q(q_hat, probs.shape)
    w, reward = _importance_weights(log, target_probs)
    rows = np.arange(len(log))
    baseline = (probs * q).sum(axis=1)
    return float(np.mean(baseline + w * (reward - q[rows, action])))


def effective_sample_size(log: pd.DataFrame, target_probs: np.ndarray) -> float:
    """(Σw)²/Σw²: filas equivalentes que sostienen la estimación. Vale n si π_e = π_b."""
    w, _ = _importance_weights(log, target_probs)
    sq = float(np.sum(w**2))
    if sq == 0.0:
        return 0.0
    return float(w.sum() ** 2 / sq)


# --- modelo de recompensa para DM y DR -----------------------------------------------------


def fit_reward_model(
    log: pd.DataFrame, x_cols: Sequence[str], n_actions: int, seed: int = 0
) -> np.ndarray:
    """q̂(x, a) para todas las acciones, con cross-fitting en 2 pliegues.

    Cada mitad del log se predice con un modelo entrenado en la otra, de modo que q̂ no ha visto
    la recompensa de la fila que evalúa; si no, el residuo de DR se contrae y el intervalo sale
    optimista. La acción entra como one-hot junto a las columnas de contexto y la predicción
    repite cada fila A veces, una por acción.
    """
    x = log[list(x_cols)].to_numpy(dtype=float)
    action = log[ACTION].to_numpy(dtype=int)
    reward = log[REWARD].to_numpy(dtype=float)
    n = len(log)
    if action.size and (action.min() < 0 or action.max() >= n_actions):
        raise ValueError(f"action fuera de rango para n_actions={n_actions}")
    eye = np.eye(n_actions)
    order = np.random.default_rng(seed).permutation(n)
    folds = (np.arange(n) < n // 2)[np.argsort(order)]  # dos mitades deterministas dado el seed
    q_hat = np.zeros((n, n_actions))
    for fold in (True, False):
        train, test = np.flatnonzero(folds == fold), np.flatnonzero(folds != fold)
        if train.size == 0 or test.size == 0:
            raise ValueError("el log es demasiado corto para cross-fitting en 2 pliegues")
        model = LGBMRegressor(
            n_estimators=200,
            learning_rate=0.05,
            num_leaves=15,
            min_child_samples=20,
            verbose=-1,
            random_state=seed,
        )
        model.fit(np.hstack([x[train], eye[action[train]]]), reward[train])
        grid = np.hstack([np.repeat(x[test], n_actions, axis=0), np.tile(eye, (test.size, 1))])
        q_hat[test] = model.predict(grid).reshape(test.size, n_actions)
    return q_hat


# --- incertidumbre -------------------------------------------------------------------------


def bootstrap_ci(
    fn: Callable[..., float],
    log: pd.DataFrame,
    target_probs: np.ndarray,
    n_boot: int = 500,
    seed: int = 0,
    **kw,
) -> tuple[float, float]:
    """Intervalo percentil al 95% de `fn` remuestreando filas con reemplazo.

    `target_probs` y cualquier array por filas que venga en `kw` (típicamente `q_hat`) se
    remuestrean con los mismos índices: si no, cada réplica mezclaría contextos de una fila con
    predicciones de otra.
    """
    if n_boot < 1:
        raise ValueError("n_boot debe ser >= 1")
    n = len(log)
    probs = np.asarray(target_probs, dtype=float)
    rng = np.random.default_rng(seed)
    values = np.empty(n_boot)
    for i in range(n_boot):
        idx = rng.integers(0, n, n)
        resampled = {
            k: (v[idx] if isinstance(v, np.ndarray) and v.shape[0] == n else v)
            for k, v in kw.items()
        }
        values[i] = fn(log.iloc[idx], probs[idx], **resampled)
    lo, hi = np.percentile(values, [2.5, 97.5])
    return float(lo), float(hi)


# --- dimensionado del experimento online ---------------------------------------------------


def power_two_proportions(p1: float, p2: float, alpha: float = 0.05, power: float = 0.8) -> int:
    """n por brazo para distinguir dos tasas de conversión (aproximación normal, test bilateral)."""
    for p in (p1, p2):
        if not 0.0 < p < 1.0:
            raise ValueError("p1 y p2 deben estar en (0, 1)")
    if p1 == p2:
        raise ValueError("p1 y p2 deben ser distintas: sin efecto no hay tamaño de muestra")
    z = norm.ppf(1.0 - alpha / 2.0) + norm.ppf(power)
    spread = p1 * (1.0 - p1) + p2 * (1.0 - p2)
    return math.ceil(z**2 * spread / (p1 - p2) ** 2)


def n_offers_for_power(
    p1: float, p2: float, epsilon: float, alpha: float = 0.05, power: float = 0.8
) -> int:
    """Ofertas registradas totales cuando solo una fracción ε se aleatoriza entre los dos brazos."""
    if not 0.0 < epsilon <= 1.0:
        raise ValueError("epsilon debe estar en (0, 1]")
    return math.ceil(2 * power_two_proportions(p1, p2, alpha=alpha, power=power) / epsilon)
