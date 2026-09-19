"""Índice de estado, evento de deterioro y etiqueta a t+6 (slices #4 y #15).

Parte compartida entre el score por reglas y el modelo GBM: los dos se entrenan y evalúan sobre
lo que sale de aquí. Especificación: docs/rules_spec.md §2–§4. Entrada: la tabla del contrato
`xray.features` (docs/features_seam.md).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xray.profile import RankProfile
from xray.rules import RulesConfig

KEYS = ["company_id", "month"]

SIGNALS: dict[str, tuple[str, bool]] = {
    # nombre corto → (columna de features, ascending): ascending=True cuando más alto es más sano.
    # Señales v2 (19 sep, revisión): los nombres cortos, y con ellos rank_*, red_* y las claves de
    # los pesos, no cambian; solo cambia la columna que leen (docs/features_seam.md §2).
    "balance": ("cash_buffer_days", True),
    "overdue": ("overdue_flow_rate_3m", False),
    "dscr": ("dscr_6m", True),
    "inflows": ("net_cash_flow_ratio_3m", True),
}
RANK_COLS = [f"rank_{s}" for s in SIGNALS]
RED_COLS = [f"red_{s}" for s in SIGNALS]


def rank_signals(features: pd.DataFrame, profile: RankProfile | None = None) -> pd.DataFrame:
    """Rango percentil dentro del mes de cada señal, orientado a 1 = más sana.

    Empates por media, NaN excluidos del rango (quedan NaN). Conserva las columnas de entrada.
    Con `profile` (xray.profile.RankProfile) las filas se ranquean contra esa población de
    referencia en vez de entre ellas: es como se puntúan las empresas nuevas.
    """
    out = features.copy()
    if profile is None:
        by_month = out.groupby("month")
        for short, (col, ascending) in SIGNALS.items():
            out[f"rank_{short}"] = by_month[col].rank(method="average", pct=True, ascending=ascending)
        return out
    months = out["month"].astype(str)
    groups = out.groupby(months).indices
    for short, (col, _) in SIGNALS.items():
        values = pd.to_numeric(out[col], errors="coerce").to_numpy(dtype=float)
        r = np.full(len(out), np.nan)
        for month, idx in groups.items():
            r[idx] = profile.rank(str(month), short, values[idx])
        out[f"rank_{short}"] = r
    return out


def state_index(ranked: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """Banderas rojas, n_red, n_signals e índice de estado (media ponderada de rangos).

    Los pesos se renormalizan sobre las señales disponibles; con menos de `cfg.min_signals`
    el índice es NaN. NaN nunca es rojo.
    """
    cfg = cfg or RulesConfig()
    out = ranked.copy()
    ranks = out[RANK_COLS].to_numpy(dtype=float)
    w = np.array([cfg.weights[s] for s in SIGNALS])
    available = ~np.isnan(ranks)

    for short in SIGNALS:
        r = out[f"rank_{short}"]
        out[f"red_{short}"] = (r <= cfg.red_cutoff).fillna(False).astype(bool)
    out["n_red"] = out[RED_COLS].sum(axis=1).astype(int)
    out["n_signals"] = available.sum(axis=1)

    weighted = np.where(available, ranks * w, 0.0).sum(axis=1)
    total_w = np.where(available, w, 0.0).sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        idx = weighted / total_w
    idx[out["n_signals"].to_numpy() < cfg.min_signals] = np.nan
    out["state_index"] = idx
    return out


def _episodes(red: np.ndarray, run: int, gap: int) -> tuple[np.ndarray, np.ndarray]:
    """Evento (primer mes de cada episodio) y meses dentro de episodio para una empresa."""
    n = len(red)
    event = np.zeros(n, dtype=bool)
    in_event = np.zeros(n, dtype=bool)

    def run_starts_at(k: int) -> bool:
        return k + run <= n and bool(red[k : k + run].all())

    i = 0
    while i < n:
        if not run_starts_at(i):
            i += 1
            continue
        event[i] = True
        j = i
        while True:
            while j < n and red[j]:
                in_event[j] = True
                j += 1
            k = j
            while k < n and not red[k]:
                k += 1
            greens = k - j
            if k < n and greens < gap and run_starts_at(k):
                in_event[j:k] = True  # el hueco corto une las dos rachas en un episodio
                j = k
                continue
            break
        i = k
    return event, in_event


def events(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """Evento de deterioro: primer mes de una racha de ≥ `event_run` meses rojos (n_red ≥ 2).

    Una racha que empieza con menos de `event_gap` verdes seguidos desde la anterior es el mismo
    episodio y no genera evento nuevo. `in_event` marca los meses dentro de un episodio.
    """
    cfg = cfg or RulesConfig()
    out = indexed.sort_values(KEYS).copy()
    red = (out["n_red"] >= cfg.red_month_min).to_numpy()
    event = np.zeros(len(out), dtype=bool)
    in_event = np.zeros(len(out), dtype=bool)
    for pos in out.groupby("company_id", sort=False).indices.values():
        event[pos], in_event[pos] = _episodes(red[pos], cfg.event_run, cfg.event_gap)
    out["event"] = event
    out["in_event"] = in_event
    return out.sort_index()


def label_t6(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """Etiqueta continua: media del índice en t+1…t+h. NaN si falta cualquiera de los h meses."""
    cfg = cfg or RulesConfig()
    out = indexed.sort_values(KEYS).copy()
    h = cfg.horizon

    def future_mean(s: pd.Series) -> pd.Series:
        fut = pd.concat([s.shift(-k) for k in range(1, h + 1)], axis=1)
        return fut.mean(axis=1).where(fut.notna().all(axis=1))

    out["label_t6"] = out.groupby("company_id", sort=False)["state_index"].transform(future_mean)
    return out.sort_index()
