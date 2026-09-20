"""Aprendizaje anidado de pesos y ventana del índice por reglas (20 sep 2026, rama ML-experiments).

Protocolo: el split temporal de producción no se toca (outer: train `month <= train_until`, test
`evals.TEST_MONTHS`); dentro de train, GroupKFold por `group_id` por empresa. Para cada candidato
(ventana L, pesos en el simplex) se mide el AUC(6) del índice suavizado en los pliegues retenidos de
train, contra dos etiquetas que el índice no construye: la externa (saldo bruto < 0 en (t, t+6]) y
PD6 (`labels.label_pd6`). Los elegidos se evalúan una sola vez en test, junto a producción, con un
bootstrap pareado por empresa.

Uso: `uv run xray-evals --features artifacts/features.parquet --tune`.
Referencia del protocolo: `docs/research/2026-09-20-pesos-por-cv.md`.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

from xray import evals, labels

KEYS = ["company_id", "month"]
SIGNALS = ("balance", "inflows", "dscr", "overdue")  # = orden de las claves de RulesConfig.weights
RANK_COLS = [f"rank_{s}" for s in SIGNALS]
WEIGHT_COLS = [f"w_{s}" for s in SIGNALS]
PRODUCTION_WEIGHTS = (0.35, 0.25, 0.20, 0.20)
PRODUCTION_WINDOW = 6


# --- utilidades internas ------------------------------------------------------------------


def _prepare(indexed: pd.DataFrame) -> pd.DataFrame:
    """Ordena por (company_id, month) y asegura `breach_entry` y `label_pd6`."""
    o = indexed.sort_values(KEYS).reset_index(drop=True)
    if "breach_entry" not in o.columns:
        o = labels.breach_state(o).sort_values(KEYS).reset_index(drop=True)
    if "label_pd6" not in o.columns:
        o = labels.label_pd6(o).sort_values(KEYS).reset_index(drop=True)
    return o


def _test_mask(month: np.ndarray, test_months: Sequence[str] | None) -> np.ndarray:
    if test_months is None:
        return np.ones(len(month), dtype=bool)
    return np.isin(month, [str(m) for m in test_months])


def _auc_mask(mask: np.ndarray, y: np.ndarray, score: np.ndarray) -> float:
    """AUC de (−score) donde la máscara es cierta y el score no es NaN; NaN sin dos clases."""
    m = mask & ~np.isnan(score)
    yy = y[m]
    if len(yy) == 0 or yy.min() == yy.max():
        return float("nan")
    return float(roc_auc_score(yy, -score[m]))


def _bootstrap_auc(y: np.ndarray, score: np.ndarray) -> float:
    """AUC de (−score) con NaN → 0,5, como el protocolo de bootstrap de referencia."""
    if len(y) == 0 or y.min() == y.max():
        return float("nan")
    return float(roc_auc_score(y, -np.nan_to_num(score, nan=0.5)))


def _auc_columns(score: np.ndarray, y: np.ndarray) -> np.ndarray:
    """AUC de (−score) por columna; `score` es (n_obs, n_candidatos). NaN sin dos clases."""
    out = np.full(score.shape[1], np.nan)
    if len(y) == 0 or y.min() == y.max():
        return out
    for j in range(score.shape[1]):
        s = score[:, j]
        m = ~np.isnan(s)
        if not m.any():
            continue
        yy = y[m]
        if yy.min() == yy.max():
            continue
        out[j] = roc_auc_score(yy, -s[m])
    return out


def _rolling_mean(values: np.ndarray, cid: np.ndarray, window: int) -> np.ndarray:
    """Media móvil por empresa con `min_periods=1`, vectorizada por suma y conteo acumulados.

    Reproduce `Series.rolling(window, min_periods=1).mean()`: media de los valores no NaN de la
    ventana, NaN si la ventana no tiene ninguno. `values` es (n, k); la salida tiene su forma.
    """
    n, k = values.shape
    out = np.empty_like(values, dtype=float)
    valid = ~np.isnan(values)
    filled = np.where(valid, values, 0.0)
    valid_f = valid.astype(float)
    starts = np.r_[0, np.flatnonzero(cid[1:] != cid[:-1]) + 1]
    ends = np.r_[starts[1:], n]
    for s, e in zip(starts, ends):
        m = e - s
        cs = np.vstack([np.zeros((1, k)), np.cumsum(filled[s:e], axis=0)])
        cc = np.vstack([np.zeros((1, k)), np.cumsum(valid_f[s:e], axis=0)])
        idx = np.arange(m)
        begin = np.maximum(0, idx - window + 1)
        sums = cs[idx + 1] - cs[begin]
        counts = cc[idx + 1] - cc[begin]
        with np.errstate(invalid="ignore", divide="ignore"):
            out[s:e] = np.where(counts > 0, sums / counts, np.nan)
    return out


def _group_series(o: pd.DataFrame, groups: Mapping | pd.Series) -> pd.Series:
    grp = o["company_id"].map(groups)
    if grp.isna().any():
        missing = sorted(set(o.loc[grp.isna(), "company_id"]))
        raise ValueError(f"search: {len(missing)} empresas sin grupo (p. ej. {missing[:3]})")
    return grp


# --- API pública --------------------------------------------------------------------------


def external_labels(indexed: pd.DataFrame, h: int = 6) -> tuple[np.ndarray, ...]:
    """Etiquetas externas a t+h, alineadas al frame ORDENADO por (company_id, month).

    Devuelve `(eligible_ext, y_ext, eligible_pd6, y_pd6, clean)`, todos `np.ndarray`:
    - `eligible_ext` = saldo mínimo ≥ 0 en t y la fila t+h existe; `y_ext` = saldo mínimo < 0 en
      alguno de t+1..t+h.
    - `eligible_pd6` = saldo ≥ 0 en t y (hay `breach_entry` observado en t+1..t+h o existe t+h);
      `y_pd6` = `breach_entry` en t+1..t+h.
    - `clean` = `months_negative_6m == 0` (NaN cuenta como 0).

    Ordena el frame dentro (misma máscara que `evals.auc_external_by_horizon` y
    `evals.auc_pd6_by_horizon`); para alinear con la entrada, pásala ya ordenada.
    """
    o = indexed.sort_values(KEYS).reset_index(drop=True)
    if "breach_entry" not in o.columns:
        o = labels.breach_state(o).sort_values(KEYS).reset_index(drop=True)
    g = o.groupby("company_id", sort=False)
    mb = o["min_balance_eur"].to_numpy(dtype=float)

    fut_neg = np.zeros(len(o), dtype=bool)
    for k in range(1, h + 1):
        fut_neg |= (g["min_balance_eur"].shift(-k) < 0).to_numpy()
    complete = g["min_balance_eur"].shift(-h).notna().to_numpy()
    eligible_ext = (mb >= 0) & complete
    y_ext = fut_neg

    fut_entry = np.zeros(len(o), dtype=bool)
    for k in range(1, h + 1):
        fut_entry |= g["breach_entry"].shift(-k).fillna(False).astype(bool).to_numpy()
    eligible_pd6 = (mb >= 0) & (fut_entry | complete)
    y_pd6 = fut_entry

    clean = (o["months_negative_6m"].fillna(0) == 0).to_numpy()
    return eligible_ext, y_ext, eligible_pd6, y_pd6, clean


def weight_grid(step: float = 0.05) -> np.ndarray:
    """Todos los pesos no negativos que suman 1 sobre el simplex con ese paso.

    Devuelve forma (n, 4) en el orden `SIGNALS` (balance, inflows, dscr, overdue).
    """
    n = round(1.0 / step)
    if n < 1:
        raise ValueError("weight_grid: step debe ser <= 1")
    rows = []
    for a in range(n + 1):
        for b in range(n + 1 - a):
            for c in range(n + 1 - a - b):
                d = n - a - b - c
                rows.append((a, b, c, d))
    return np.asarray(rows, dtype=float) / n


def index_level(indexed: pd.DataFrame, weights: Sequence[float], window: int) -> np.ndarray:
    """Índice ponderado y su media móvil de `window` meses, alineado al frame ORDENADO.

    Media ponderada de los rangos disponibles, pesos renormalizados sobre las señales presentes
    (NaN si en la fila no hay ninguna señal ponderada); después media móvil por empresa con
    `min_periods=1` (ventana 1 = sin suavizar). Ordena el frame dentro; pásalo ya ordenado para
    alinear el resultado. Equivale a `labels.state_index` + `rules.level` con esos pesos/ventana.
    """
    o = indexed.sort_values(KEYS).reset_index(drop=True)
    ranks = o[RANK_COLS].to_numpy(dtype=float)
    w = np.asarray(weights, dtype=float)
    avail = ~np.isnan(ranks)
    num = np.where(avail, ranks, 0.0) @ w
    den = avail @ w
    with np.errstate(invalid="ignore", divide="ignore"):
        idx = np.where(den > 0, num / den, np.nan)
    if window <= 1:
        return idx
    return _rolling_mean(idx.reshape(-1, 1), o["company_id"].to_numpy(), window)[:, 0]


def search(
    indexed: pd.DataFrame,
    groups: Mapping | pd.Series,
    train_until: str = "2025-08",
    n_splits: int = 5,
    step: float = 0.05,
    windows: Iterable[int] = (1, 2, 3, 6),
) -> pd.DataFrame:
    """Búsqueda CV anidada de (ventana, pesos): una fila por candidato.

    Columnas: `L`, `w_balance`, `w_inflows`, `w_dscr`, `w_overdue`, `cv_ext`, `cv_ext_sd`,
    `cv_pd6`. Para cada candidato se hace GroupKFold(`n_splits`, recortado al número de grupos) por
    `group_id` sobre el frame completo, pero el AUC de cada pliegue retenido se calcula solo sobre
    sus filas de TRAIN (`month <= train_until`) elegibles. `cv_ext` = media del AUC de (−nivel)
    frente a `y_ext`; `cv_pd6` igual frente a `y_pd6`. Lanza ValueError si alguna empresa no tiene
    grupo.
    """
    o = _prepare(indexed)
    grp = _group_series(o, groups)
    elig_ext, y_ext, elig_pd6, y_pd6, _ = external_labels(o)
    month = o["month"].astype(str).to_numpy()
    is_train = month <= str(train_until)
    cid = o["company_id"].to_numpy()

    grid = weight_grid(step)
    ranks = o[RANK_COLS].to_numpy(dtype=float)
    avail = ~np.isnan(ranks)
    num = np.where(avail, ranks, 0.0) @ grid.T
    den = avail @ grid.T
    with np.errstate(invalid="ignore", divide="ignore"):
        idx = np.where(den > 0, num / den, np.nan)  # (n, n_candidatos)

    k = int(min(n_splits, grp.nunique()))
    folds = [te for _, te in GroupKFold(k).split(o, groups=grp.to_numpy())]

    rows = []
    for window in windows:
        lvl = idx if window <= 1 else _rolling_mean(idx, cid, window)
        ext_folds = np.full((len(folds), len(grid)), np.nan)
        pd6_folds = np.full((len(folds), len(grid)), np.nan)
        for fi, te in enumerate(folds):
            m = np.zeros(len(o), dtype=bool)
            m[te] = True
            m &= is_train
            me = m & elig_ext
            if me.any():
                ext_folds[fi] = _auc_columns(lvl[me, :], y_ext[me])
            mp = m & elig_pd6
            if mp.any():
                pd6_folds[fi] = _auc_columns(lvl[mp, :], y_pd6[mp])
        cv_ext = np.nanmean(ext_folds, axis=0)
        cv_ext_sd = np.nanstd(ext_folds, axis=0)
        cv_pd6 = np.nanmean(pd6_folds, axis=0)
        for j in range(len(grid)):
            row = {"L": int(window)}
            row.update({col: float(grid[j, i]) for i, col in enumerate(WEIGHT_COLS)})
            row["cv_ext"] = float(cv_ext[j])
            row["cv_ext_sd"] = float(cv_ext_sd[j])
            row["cv_pd6"] = float(cv_pd6[j])
            rows.append(row)
    return pd.DataFrame(rows, columns=["L", *WEIGHT_COLS, "cv_ext", "cv_ext_sd", "cv_pd6"])


def _evaluate_prepared(
    o: pd.DataFrame, level: np.ndarray, test_months: Sequence[str] | None
) -> dict:
    """Métricas de un nivel ya calculado sobre el frame preparado."""
    elig_ext, y_ext, elig_pd6, y_pd6, clean = external_labels(o)
    is_test = _test_mask(o["month"].astype(str).to_numpy(), test_months)
    tbl = o[["company_id", "month"]].copy()
    tbl["level"] = level
    st = evals.stability(tbl, "level", test_months)
    return {
        "test_ext6": _auc_mask(is_test & elig_ext, y_ext, level),
        "test_pd6": _auc_mask(is_test & elig_pd6, y_pd6, level),
        "test_ext6_clean": _auc_mask(is_test & elig_ext & clean, y_ext, level),
        "test_pd6_clean": _auc_mask(is_test & elig_pd6 & clean, y_pd6, level),
        "spearman": float(st["spearman_month_to_month"]),
        "jumps": float(st["jump_rate_2_deciles"]),
    }


def evaluate(
    indexed: pd.DataFrame,
    weights: Sequence[float],
    window: int,
    test_months: Sequence[str] | None = evals.TEST_MONTHS,
) -> dict:
    """Evalúa un candidato en test: AUC externa y PD6 (y las limpias) más estabilidad.

    Claves: `test_ext6`, `test_pd6`, `test_ext6_clean`, `test_pd6_clean`, `spearman`, `jumps`.
    """
    o = _prepare(indexed)
    level = index_level(o, weights, window)
    return _evaluate_prepared(o, level, test_months)


def best(
    results: pd.DataFrame,
    min_weight: float = 0.0,
    window: int | None = None,
    by: str = "cv_ext",
) -> dict:
    """Fila (como dict) con el mayor `by` entre las que cumplen `min_weight` y, si se da, `L`."""
    mask = (results[WEIGHT_COLS] >= min_weight).all(axis=1)
    if window is not None:
        mask &= results["L"] == window
    sub = results[mask]
    if sub.empty:
        raise ValueError(f"best: ningún candidato con min_weight={min_weight}, window={window}")
    return sub.sort_values(by, ascending=False).iloc[0].to_dict()


def _cv_ext_lookup(results: pd.DataFrame, weights: Sequence[float], window: int) -> float:
    """`cv_ext` del candidato si está en la rejilla; NaN si no."""
    mask = (results["L"].to_numpy() == window)
    for col, val in zip(WEIGHT_COLS, weights):
        mask &= np.isclose(results[col].to_numpy(), float(val), atol=1e-9)
    if not mask.any():
        return float("nan")
    return float(results.loc[mask, "cv_ext"].iloc[0])


def compare(
    indexed: pd.DataFrame,
    groups: Mapping | pd.Series,
    train_until: str = "2025-08",
    test_months: Sequence[str] | None = evals.TEST_MONTHS,
    n_boot: int = 300,
    seed: int = 0,
    step: float = 0.05,
    windows: Iterable[int] = (1, 2, 3, 6),
) -> dict:
    """Producción frente a los candidatos aprendidos en test, con bootstrap pareado por empresa.

    Devuelve `{"search_top": ..., "picks": ...}`. `search_top` son las 20 mejores filas de `search`
    por `cv_ext`. `picks` incluye producción (pesos y ventana de fábrica, L=3, L=1), pesos iguales,
    solo saldo, el mejor por CV externo (`cv_best`), el mejor con L=6 (`cv_best_L6`), el mejor con
    cada peso ≥ 0,10 (`cv_best_min10`) y el mejor por PD6 (`cv_best_pd6`). Cada pick lleva `L`,
    `weights`, las claves de `evaluate`, `cv_ext` (si está en la rejilla) y, salvo producción, los
    intervalos 95 % de (AUC pick − AUC producción) en test: `d_ext_ci` y `d_pd6_ci` = [lo, media, hi]
    resampleando empresas con reemplazo.
    """
    o = _prepare(indexed)
    res = search(o, groups, train_until=train_until, step=step, windows=windows)
    elig_ext, y_ext, elig_pd6, y_pd6, _ = external_labels(o)
    cid = o["company_id"].to_numpy()
    month = o["month"].astype(str).to_numpy()
    is_test = _test_mask(month, test_months)

    items: dict[str, tuple[list[float], int]] = {
        "production": (list(PRODUCTION_WEIGHTS), PRODUCTION_WINDOW),
        "production_L3": (list(PRODUCTION_WEIGHTS), 3),
        "production_L1": (list(PRODUCTION_WEIGHTS), 1),
        "equal": ([0.25, 0.25, 0.25, 0.25], 6),
        "balance_only": ([1.0, 0.0, 0.0, 0.0], 6),
    }
    b_ext = best(res, by="cv_ext")
    b_ext_l6 = best(res, by="cv_ext", window=6)
    b_ext_min10 = best(res, by="cv_ext", min_weight=0.1)
    b_pd6 = best(res, by="cv_pd6")
    items["cv_best"] = ([b_ext[c] for c in WEIGHT_COLS], int(b_ext["L"]))
    items["cv_best_L6"] = ([b_ext_l6[c] for c in WEIGHT_COLS], int(b_ext_l6["L"]))
    items["cv_best_min10"] = ([b_ext_min10[c] for c in WEIGHT_COLS], int(b_ext_min10["L"]))
    items["cv_best_pd6"] = ([b_pd6[c] for c in WEIGHT_COLS], int(b_pd6["L"]))

    levels: dict[str, np.ndarray] = {}
    picks: dict[str, dict] = {}
    for name, (weights, window) in items.items():
        level = index_level(o, weights, window)
        levels[name] = level
        picks[name] = {
            "L": window,
            "weights": [float(w) for w in weights],
            **_evaluate_prepared(o, level, test_months),
            "cv_ext": _cv_ext_lookup(res, weights, window),
        }

    # bootstrap pareado por empresa sobre las filas de test elegibles
    firms = np.unique(cid[is_test])
    rows_ext = np.flatnonzero(is_test & elig_ext)
    rows_pd6 = np.flatnonzero(is_test & elig_pd6)
    by_firm_ext = pd.Series(rows_ext).groupby(cid[rows_ext]).indices
    by_firm_pd6 = pd.Series(rows_pd6).groupby(cid[rows_pd6]).indices
    rng = np.random.default_rng(seed)
    deltas = {name: {"ext": [], "pd6": []} for name in picks if name != "production"}
    prod = levels["production"]
    for _ in range(n_boot):
        draw = rng.choice(firms, len(firms), replace=True)
        re_ = [rows_ext[by_firm_ext[f]] for f in draw if f in by_firm_ext]
        rp = [rows_pd6[by_firm_pd6[f]] for f in draw if f in by_firm_pd6]
        if re_:
            idx = np.concatenate(re_)
            base = _bootstrap_auc(y_ext[idx], prod[idx])
            if np.isfinite(base):
                for name in deltas:
                    a = _bootstrap_auc(y_ext[idx], levels[name][idx])
                    if np.isfinite(a):
                        deltas[name]["ext"].append(a - base)
        if rp:
            idx = np.concatenate(rp)
            base = _bootstrap_auc(y_pd6[idx], prod[idx])
            if np.isfinite(base):
                for name in deltas:
                    a = _bootstrap_auc(y_pd6[idx], levels[name][idx])
                    if np.isfinite(a):
                        deltas[name]["pd6"].append(a - base)

    def _ci(values: list[float]) -> list[float]:
        a = np.asarray(values, dtype=float)
        if len(a) == 0:
            return [float("nan")] * 3
        return [float(np.percentile(a, 2.5)), float(a.mean()), float(np.percentile(a, 97.5))]

    for name in deltas:
        picks[name]["d_ext_ci"] = _ci(deltas[name]["ext"])
        picks[name]["d_pd6_ci"] = _ci(deltas[name]["pd6"])

    top = res.sort_values("cv_ext", ascending=False).head(20)
    return {
        "train_until": str(train_until),
        "test_months": None if test_months is None else [str(m) for m in test_months],
        "n_boot": int(n_boot),
        "seed": int(seed),
        "step": float(step),
        "windows": [int(w) for w in windows],
        "search_top": top.to_dict(orient="records"),
        "picks": picks,
    }
