"""Explicación exacta del score y agregación por grupo (slices #9 y #10).

Qué señal movió la nota, cuánto y desde cuándo, sin aproximaciones. Con pesos fijos y nivel =
media de `level_window` meses del índice, el cambio de nivel entre t−lag y t se reparte entre las
señales como w_s × (media móvil del rango_s en t − la misma media en t−lag); la pendiente del mapa
entre los dos niveles lo convierte en puntos. La suma coincide con el cambio del score cuando las
cuatro señales están presentes en las dos ventanas; si falta alguna, la renormalización de pesos
deja un residuo pequeño. `since` es el primer mes de la racha roja actual de cada señal.

    drivers(scored)        formato largo: una fila por empresa, mes y señal
    drivers_json(scored)   el campo `drivers` del JSON de /score (docs/plan.md §6), una lista por fila
    group_rollup(scored, companies)   vista por grupo para el monitor
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from xray import labels
from xray.rules import RulesConfig

KEYS = ["company_id", "month"]


def red_since(scored: pd.DataFrame) -> pd.DataFrame:
    """Por señal, `since_<señal>` = primer mes de la racha roja que llega hasta la fila; None si no está en rojo."""
    o = scored.sort_values(KEYS).copy()
    months = o["month"].astype(str)
    by_company = o["company_id"]
    for short in labels.SIGNALS:
        red = o[f"red_{short}"].astype(bool)
        prev = red.groupby(by_company, sort=False).shift(1).fillna(False).astype(bool)
        start = months.where(red & ~prev)
        since = start.groupby(by_company, sort=False).ffill()
        o[f"since_{short}"] = np.where(red, since, None)
    return o


def drivers(scored: pd.DataFrame, cfg: RulesConfig | None = None, lag: int = 3) -> pd.DataFrame:
    """Atribución del cambio de score entre t−lag y t, por señal, en unidades de nivel y en puntos."""
    cfg = cfg or RulesConfig()
    o = red_since(scored)
    g = o.groupby("company_id", sort=False)
    dlevel = o["level"] - g["level"].shift(lag)
    dscore = o["score"] - g["score"].shift(lag)
    with np.errstate(divide="ignore", invalid="ignore"):
        slope = np.where(np.abs(dlevel.to_numpy()) > 1e-12, dscore.to_numpy() / dlevel.to_numpy(), 0.0)
    parts = []
    for short, (col, _) in labels.SIGNALS.items():
        mean = g[f"rank_{short}"].transform(lambda s: s.rolling(cfg.level_window, min_periods=1).mean())
        mean_lag = mean.groupby(o["company_id"], sort=False).shift(lag)
        delta_level = cfg.weights[short] * (mean - mean_lag)
        parts.append(pd.DataFrame({
            "company_id": o["company_id"].to_numpy(),
            "month": o["month"].astype(str).to_numpy(),
            "signal": short,
            "column": col,
            "value": o[col].to_numpy(dtype=float) if col in o.columns else np.nan,
            "rank": o[f"rank_{short}"].to_numpy(dtype=float),
            "red": o[f"red_{short}"].astype(bool).to_numpy(),
            "since": o[f"since_{short}"].to_numpy(),
            "delta_level": delta_level.to_numpy(dtype=float),
            "delta_points": delta_level.to_numpy(dtype=float) * slope,
        }))
    out = pd.concat(parts, ignore_index=True)
    return out.sort_values(KEYS + ["signal"]).reset_index(drop=True)


def drivers_json(scored: pd.DataFrame, cfg: RulesConfig | None = None, lag: int = 3) -> pd.DataFrame:
    """Una fila por empresa y mes con `drivers`: lista de {signal, delta, since, value, rank},
    ordenada por |delta| descendente (los sin delta, al final)."""
    d = drivers(scored, cfg, lag)

    def pack(group: pd.DataFrame) -> list[dict]:
        order = group["delta_points"].abs().fillna(-1.0).sort_values(ascending=False).index
        items = []
        for r in group.loc[order].to_dict("records"):
            items.append({
                "signal": r["column"],
                "delta": None if pd.isna(r["delta_points"]) else round(float(r["delta_points"]), 2),
                "since": r["since"] if isinstance(r["since"], str) else None,
                "value": None if pd.isna(r["value"]) else float(r["value"]),
                "rank": None if pd.isna(r["rank"]) else round(float(r["rank"]), 3),
            })
        return items

    rows = [{"company_id": cid, "month": month, "drivers": pack(grp)} for (cid, month), grp in d.groupby(KEYS, sort=True)]
    return pd.DataFrame(rows, columns=KEYS + ["drivers"])


def group_rollup(scored: pd.DataFrame, companies: pd.DataFrame) -> pd.DataFrame:
    """Por (group_id, month): score medio ponderado por entradas operativas (mínimo 1 €), score
    mínimo, empresa más débil (menor score; a igual score, menor nivel), nº de empresas y cuota con
    outlook negativo. Solo filas con score."""
    o = scored.merge(companies[["company_id", "group_id"]], on="company_id", how="inner")
    o = o[o["score"].notna()].copy()
    o["w"] = o["operating_inflows_eur"].clip(lower=1.0)
    o["sw"] = o["score"] * o["w"]
    grp = o.groupby(["group_id", "month"])
    out = pd.DataFrame({
        "score": grp["sw"].sum() / grp["w"].sum(),
        "score_min": grp["score"].min(),
        "n_companies": grp["company_id"].nunique(),
        "share_negative": grp["outlook"].apply(lambda s: float((s == "negative").mean())),
    }).reset_index()
    weakest = (o.sort_values(["group_id", "month", "score", "level"])
                 .groupby(["group_id", "month"], as_index=False)["company_id"].first()
                 .rename(columns={"company_id": "weakest_company_id"}))
    return out.merge(weakest, on=["group_id", "month"], how="left")
