"""Estudio de eventos: ATT con controles emparejados y DiD con no-tratados-aún (experimento A2).

Mide qué le pasa a un resultado (índice de estado, score, breach de caja) después de que una
empresa adopta un producto, comparándola con empresas que no lo adoptaron. Dos estimadores sobre
el mismo panel mensual `(company_id, month, ...)` y la misma tabla de eventos `(company_id, month)`:

- `matched_att`: por cada evento, controles observados el mes anterior en el mismo cuantil dentro
  del mes y sin evento propio en la ventana de exclusión. Trae el pre-trend, que es el contraste
  de falsación: si no es ~0 los dos grupos ya divergían antes del evento y el ATT no se lee como
  causal.
- `did_not_yet_treated`: Callaway–Sant'Anna simplificado. Cohortes por mes de evento, contrafactual
  las empresas que en g+h todavía no han adoptado; sin emparejar, pero sin usar como control a
  nadie ya tratado.

Ninguna de las dos entra en el score: son evidencia para el experimento A2, se consumen desde
notebooks. Las cifras son medias de diferencias, no promesas causales: se leen junto al pre-trend.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

KEYS = ["company_id", "month"]

MATCHED_COLUMNS = [
    "h", "n_events", "mean_treated", "mean_control", "att", "se", "ci_lo", "ci_hi",
    "pretrend_att", "pretrend_se",
]
DID_COLUMNS = ["h", "n_events", "n_cohorts", "att", "se", "ci_lo", "ci_hi"]


# --- utilidades ---------------------------------------------------------------------------


def _period(months) -> pd.PeriodIndex:
    """Meses como PeriodIndex mensual, vengan como texto '2026-01', Timestamp o Period."""
    return pd.PeriodIndex(pd.Series(months).astype(str), freq="M")


def _values(frame: pd.DataFrame, col: str) -> np.ndarray:
    """Una columna como float con NaN donde falte; tolera bool, enteros y dtypes nullable."""
    return pd.to_numeric(frame[col], errors="coerce").astype("float64").to_numpy()


def _lookup(panel: pd.DataFrame, col: str, months: np.ndarray | None = None) -> dict:
    """Diccionario (company_id, Period) → valor: se construye una vez y evita filtrar el panel.

    `months` son los Period ya construidos, para no repetir la conversión en cada llamada.
    """
    mp = _period(panel["month"]).to_numpy() if months is None else months
    return dict(zip(zip(np.asarray(panel["company_id"]), mp), _values(panel, col)))


def _event_months(events: pd.DataFrame) -> dict:
    """company_id → mes del primer evento. Si una empresa repite, gana el más antiguo."""
    if len(events) == 0:
        return {}
    ev = pd.DataFrame(
        {"company_id": np.asarray(events["company_id"]), "mp": _period(events["month"])}
    )
    first = ev.groupby("company_id")["mp"].min()
    return dict(zip(first.index, first))


def _mean(values) -> float:
    """Media ignorando NaN; NaN si no queda ningún valor (y sin el aviso de numpy)."""
    a = np.asarray(values, dtype="float64")
    a = a[np.isfinite(a)]
    return float(a.mean()) if a.size else float("nan")


def _summary(means: np.ndarray) -> tuple[float, float, float]:
    """Desviación típica y percentiles 2,5 / 97,5 de una distribución bootstrap."""
    m = means[np.isfinite(means)]
    if m.size < 2:
        return float("nan"), float("nan"), float("nan")
    return float(m.std(ddof=1)), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def _boot_se(values: np.ndarray, n_boot: int, seed: int) -> tuple[float, float, float]:
    """Bootstrap de la media: remuestrea las observaciones con reemplazo `n_boot` veces."""
    v = np.asarray(values, dtype="float64")
    v = v[np.isfinite(v)]
    if v.size < 2 or n_boot < 2:
        return float("nan"), float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    means = v[rng.integers(0, v.size, size=(n_boot, v.size))].mean(axis=1)
    return _summary(means)


def _month_quantile(s: pd.Series, n_quantiles: int) -> np.ndarray:
    """Cuantil dentro del mes, 0 = el valor más bajo.

    NaN si el mes tiene menos valores que cuantiles. Los empates se rompen por orden de aparición
    (`rank(method="first")`), así qcut nunca se queda sin bordes distintos: el emparejamiento solo
    necesita estratos del mismo tamaño, no cortes interpretables.
    """
    if s.notna().sum() < n_quantiles:
        return np.full(len(s), np.nan)
    return np.asarray(pd.qcut(s.rank(method="first"), n_quantiles, labels=False), dtype="float64")


# --- resultado derivado -------------------------------------------------------------------


def future_any_below(
    panel: pd.DataFrame, col: str, h: int = 6, threshold: float = 0.0, name: str = "breach6"
) -> pd.DataFrame:
    """Añade la columna `name`: 1.0 si `col` baja de `threshold` en algún mes de t+1..t+h.

    NaN cuando a la empresa no le quedan los `h` meses futuros en el panel: al final de la historia
    un 0 sería un "no hubo breach" inventado por falta de datos. Devuelve una copia del panel en su
    orden de filas original.

    Mira las `h` filas siguientes de cada empresa, así que supone la rejilla mensual completa que
    da `xray.features`; con huecos en los meses el horizonte se estiraría sin avisar.
    """
    if h < 1:
        raise ValueError("future_any_below necesita h >= 1")
    work = pd.DataFrame(
        {
            "company_id": np.asarray(panel["company_id"]),
            "month": _period(panel["month"]),
            "v": _values(panel, col),
        }
    ).sort_values(["company_id", "month"], kind="stable")
    g = work.groupby("company_id", sort=False)["v"]
    fut = pd.concat([g.shift(-k).rename(k) for k in range(1, h + 1)], axis=1)
    flag = (fut < threshold).any(axis=1).astype("float64").where(fut.notna().all(axis=1))
    out = panel.copy()
    out[name] = flag.sort_index().to_numpy()  # sort_index deshace el sort_values: orden original
    return out


# --- estimadores --------------------------------------------------------------------------


def matched_att(
    panel: pd.DataFrame,
    events: pd.DataFrame,
    outcome: str,
    horizons: Sequence[int] = (1, 3, 6),
    quantile_col: str = "state_index",
    n_quantiles: int = 5,
    exclusion: tuple[int, int] = (3, 6),
    binary: bool = False,
    pretrend_lag: int = 5,
    n_boot: int = 200,
    seed: int = 0,
) -> pd.DataFrame:
    """ATT de cada evento contra controles emparejados dentro del mes anterior.

    Por cada evento (empresa tratada, mes t) los controles son las empresas observadas en t−1 en el
    mismo cuantil de `quantile_col` dentro de ese mes, distintas de la tratada y sin evento propio
    en [t−exclusion[0], t+exclusion[1]]. El valor de la tratada a horizonte h es y(t+h) − y(t−1), o
    y(t+h) a secas si `binary`; el del control es la media de esa misma cantidad sobre los controles
    emparejados, y el ATT la media de la diferencia sobre los eventos. `se`, `ci_lo` y `ci_hi` salen
    de un bootstrap sobre eventos (percentiles 2,5 y 97,5).

    `pretrend_att` repite la construcción con y(t−1) − y(t−1−pretrend_lag), también con `binary`, y
    sobre los mismos eventos que entran en cada horizonte: es el contraste de falsación, no un
    resultado.

    Un evento se descarta si no aparece en t−1, si su cuantil es NaN, si se queda sin controles o si
    su valor (o el de todos los controles) no existe a ese horizonte; `n_events` cuenta los que
    quedan, y puede variar entre horizontes. Con horizontes mayores que `exclusion[1]` los controles
    pueden adoptar dentro de la ventana de resultado: sube `exclusion` antes que el horizonte.

    Devuelve una fila por horizonte con las columnas de `MATCHED_COLUMNS`.
    """
    ids = np.asarray(panel["company_id"])
    mp = _period(panel["month"]).to_numpy()  # los Period se construyen una vez, no por lookup
    quantiles = panel.groupby("month")[quantile_col].transform(_month_quantile, n_quantiles)
    y = _lookup(panel, outcome, mp)
    ev = _event_months(events)
    low, high = int(exclusion[0]), int(exclusion[1])

    # Estratos (mes, cuantil) → empresas, y el estrato de cada (empresa, mes): una pasada.
    strata: dict = {}
    stratum_of: dict = {}
    for cid, m, q in zip(ids, mp, quantiles.to_numpy(dtype="float64")):
        if not np.isfinite(q):
            continue
        key = (m, int(q))
        stratum_of[(cid, m)] = key
        strata.setdefault(key, []).append(cid)

    def change(cid, t, h: int) -> float:
        """Cambio entre t−1 y t+h; el nivel en t+h cuando el resultado ya es binario."""
        end = y.get((cid, t + h), np.nan)
        return end if binary else end - y.get((cid, t - 1), np.nan)

    def pretrend(cid, t) -> float:
        return y.get((cid, t - 1), np.nan) - y.get((cid, t - 1 - pretrend_lag), np.nan)

    # Los controles dependen solo del evento, no del horizonte: se emparejan una vez.
    matched = []
    for cid, t in sorted(ev.items()):
        key = stratum_of.get((cid, t - 1))
        if key is None:
            continue
        controls = [
            c
            for c in strata[key]
            if c != cid and not (c in ev and t - low <= ev[c] <= t + high)
        ]
        if controls:
            pre = pretrend(cid, t) - _mean([pretrend(c, t) for c in controls])
            matched.append((cid, t, controls, pre))

    rows = []
    for h in horizons:
        treated, control, pres = [], [], []
        for cid, t, controls, pre in matched:
            tv = change(cid, t, h)
            cv = _mean([change(c, t, h) for c in controls])
            if np.isfinite(tv) and np.isfinite(cv):
                treated.append(tv)
                control.append(cv)
                pres.append(pre)
        tv_arr = np.asarray(treated, dtype="float64")
        cv_arr = np.asarray(control, dtype="float64")
        att = tv_arr - cv_arr
        se, ci_lo, ci_hi = _boot_se(att, n_boot, seed)
        rows.append(
            {
                "h": int(h),
                "n_events": int(att.size),
                "mean_treated": _mean(tv_arr),
                "mean_control": _mean(cv_arr),
                "att": _mean(att),
                "se": se,
                "ci_lo": ci_lo,
                "ci_hi": ci_hi,
                "pretrend_att": _mean(pres),
                "pretrend_se": _boot_se(np.asarray(pres, dtype="float64"), n_boot, seed + 1)[0],
            }
        )
    return pd.DataFrame(rows, columns=MATCHED_COLUMNS)


def did_not_yet_treated(
    panel: pd.DataFrame,
    events: pd.DataFrame,
    outcome: str,
    horizons: Sequence[int] = (1, 3, 6),
    binary: bool = False,
    n_boot: int = 200,
    seed: int = 0,
) -> pd.DataFrame:
    """DiD con no-tratados-aún, al estilo Callaway–Sant'Anna.

    Para la cohorte g (mes de evento) y el horizonte h, ATT(g, h) es la media de y(g+h) − y(g−1) en
    la cohorte menos la media del mismo cambio entre las empresas todavía no tratadas en g+h (nunca
    tratadas, o con evento posterior a g+h); con `binary`, el nivel y(g+h) en vez del cambio. Se
    agrega sobre cohortes pesando por el tamaño de la cohorte, Σ n_g·ATT(g,h) / Σ n_g.

    El error estándar y el intervalo salen de un bootstrap que remuestrea empresas con reemplazo
    (tratadas y controles a la vez) y recalcula el agregado: el cluster es la empresa, que aparece
    en varias cohortes como control. `n_events` son las empresas tratadas que aportan a ese
    horizonte y `n_cohorts` las cohortes con tratadas y controles.

    Devuelve una fila por horizonte con las columnas de `DID_COLUMNS`.
    """
    y = _lookup(panel, outcome)
    ev = _event_months(events)
    companies = list(pd.unique(np.asarray(panel["company_id"])))
    code = {c: i for i, c in enumerate(companies)}
    cohorts: dict = {}
    for cid, g in ev.items():
        if cid in code:
            cohorts.setdefault(g, []).append(cid)

    def block(ids, g, h: int) -> tuple[np.ndarray, np.ndarray]:
        """Índices de empresa y valores finitos del cambio y(g+h) − y(g−1) para `ids`."""
        idx, val = [], []
        for c in ids:
            end = y.get((c, g + h), np.nan)
            v = end if binary else end - y.get((c, g - 1), np.nan)
            if np.isfinite(v):
                idx.append(code[c])
                val.append(v)
        return np.asarray(idx, dtype="int64"), np.asarray(val, dtype="float64")

    def aggregate(blocks, w: np.ndarray) -> float:
        """Σ n_g·ATT(g,h) / Σ n_g con pesos por empresa (1 en la estimación puntual)."""
        num = den = 0.0
        for t_idx, t_val, c_idx, c_val in blocks:
            wt, wc = w[t_idx], w[c_idx]
            n_g, n_c = wt.sum(), wc.sum()
            if n_g <= 0 or n_c <= 0:
                continue
            num += n_g * (float(wt @ t_val) / n_g - float(wc @ c_val) / n_c)
            den += n_g
        return num / den if den > 0 else float("nan")

    ones = np.ones(len(companies))
    rows = []
    for h in horizons:
        blocks = []
        for g in sorted(cohorts):
            t_idx, t_val = block(cohorts[g], g, h)
            if not t_val.size:
                continue
            not_yet = [c for c in companies if c not in ev or ev[c] > g + h]
            c_idx, c_val = block(not_yet, g, h)
            if c_val.size:
                blocks.append((t_idx, t_val, c_idx, c_val))
        # El cluster del bootstrap es la empresa: la misma aparece como control en varias cohortes.
        universe = (
            np.unique(np.concatenate([b[0] for b in blocks] + [b[2] for b in blocks]))
            if blocks
            else np.empty(0, dtype="int64")
        )
        if universe.size >= 2 and n_boot >= 2:
            rng = np.random.default_rng(seed)
            draws = universe[rng.integers(0, universe.size, size=(n_boot, universe.size))]
            means = np.asarray(
                [aggregate(blocks, np.bincount(d, minlength=len(companies)).astype("float64"))
                 for d in draws]
            )
            se, ci_lo, ci_hi = _summary(means)
        else:
            se = ci_lo = ci_hi = float("nan")
        rows.append(
            {
                "h": int(h),
                "n_events": int(sum(b[1].size for b in blocks)),
                "n_cohorts": len(blocks),
                "att": aggregate(blocks, ones) if blocks else float("nan"),
                "se": se,
                "ci_lo": ci_lo,
                "ci_hi": ci_hi,
            }
        )
    return pd.DataFrame(rows, columns=DID_COLUMNS)
