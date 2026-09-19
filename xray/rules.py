"""Score por reglas calibradas (slice #15). Especificación: docs/rules_spec.md.

Nivel → mapa isotónico → score 0–100; outlook por persistencia; watch desde eventos externos;
confidence por historial y cobertura. Solo lee la salida de `xray.labels`.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

KEYS = ["company_id", "month"]
WATCH_KINDS = ("large_maturity", "main_customer_lost", "expensive_new_debt")  # orden = prioridad


@dataclass(frozen=True)
class RulesConfig:
    """Todos los parámetros del score por reglas, con los valores acordados en docs/rules_spec.md."""

    weights: dict[str, float] = field(
        default_factory=lambda: {"balance": 0.35, "inflows": 0.25, "dscr": 0.20, "overdue": 0.20}
    )
    red_cutoff: float = 0.20  # rango ≤ red_cutoff es rojo
    min_signals: int = 1  # señales necesarias para que exista el índice; una basta (19 sep), confidence avisa
    red_month_min: int = 2  # n_red ≥ 2 es mes rojo
    event_run: int = 2  # meses rojos seguidos para que empiece un evento
    event_gap: int = 2  # verdes seguidos necesarios para que el siguiente evento sea otro episodio
    horizon: int = 6  # meses de la etiqueta: nivel realizado a t+6
    level_window: int = 6  # media móvil del índice
    outlook_window: int = 6  # meses que mira el outlook
    outlook_negative_min: int = 3  # rojos en la ventana (y t rojo) → negative
    outlook_greens: int = 3  # últimos verdes seguidos para positive
    outlook_streak_min: int = 2  # rojos en los 3 anteriores para que cuente como racha
    watch_months: int = 3  # meses que dura un watch, el del evento incluido
    lead_percentile: float = 20.0  # percentil de scores de train que define lead_cutoff
    confidence_high: tuple[int, int] = (12, 3)  # (months_of_history, n_signals) mínimos
    confidence_medium: tuple[int, int] = (6, 2)


# --- nivel --------------------------------------------------------------------------------


def level(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """Media móvil de `level_window` meses del índice; con menos meses, la media de los que hay."""
    cfg = cfg or RulesConfig()
    out = indexed.sort_values(KEYS).copy()
    rolling = out.groupby("company_id", sort=False)["state_index"].transform(
        lambda s: s.rolling(cfg.level_window, min_periods=1).mean()
    )
    out["level"] = rolling.where(out["state_index"].notna())
    return out.sort_index()


# --- mapa isotónico -----------------------------------------------------------------------


@dataclass
class RulesModel:
    """Mapa nivel → E[nivel a t+6] como nudos de una función monótona, en escala 0–100."""

    knots_x: list[float]
    knots_y: list[float]
    train_until: str
    lead_cutoff: float
    n_train: int

    def predict(self, level: np.ndarray | pd.Series) -> np.ndarray:
        x = np.asarray(level, dtype=float)
        return np.interp(x, self.knots_x, self.knots_y)  # clip en los extremos; NaN → NaN

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> RulesModel:
        return cls(**json.loads(Path(path).read_text(encoding="utf-8")))


def fit(indexed: pd.DataFrame, cfg: RulesConfig | None = None, train_until: str = "2025-08") -> RulesModel:
    """Ajusta el mapa isotónico sobre las filas con `month ≤ train_until` y etiqueta."""
    cfg = cfg or RulesConfig()
    train = indexed[(indexed["month"].astype(str) <= train_until)].dropna(subset=["level", "label_t6"])
    if len(train) < 2:
        raise ValueError(f"fit: solo {len(train)} filas de train hasta {train_until}")
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(train["level"].to_numpy(), train["label_t6"].to_numpy())
    model = RulesModel(
        knots_x=[float(v) for v in iso.X_thresholds_],
        knots_y=[float(v) * 100 for v in iso.y_thresholds_],
        train_until=train_until,
        lead_cutoff=0.0,
        n_train=len(train),
    )
    model.lead_cutoff = float(np.percentile(model.predict(train["level"]), cfg.lead_percentile))
    return model


# --- outlook ------------------------------------------------------------------------------


def outlook(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """negative / positive / stable por persistencia del mes rojo en los últimos 6 meses."""
    cfg = cfg or RulesConfig()
    out = indexed.sort_values(KEYS).copy()
    red = (out["n_red"] >= cfg.red_month_min).astype(int)
    g = red.groupby(out["company_id"], sort=False)
    w = cfg.outlook_window
    reds_in_window = g.transform(lambda s: s.rolling(w, min_periods=w).sum())
    last_greens = g.transform(lambda s: s.rolling(cfg.outlook_greens, min_periods=cfg.outlook_greens).sum())
    before = g.transform(
        lambda s: s.shift(cfg.outlook_greens).rolling(w - cfg.outlook_greens, min_periods=w - cfg.outlook_greens).sum()
    )
    negative = (reds_in_window >= cfg.outlook_negative_min) & (red == 1)
    positive = (last_greens == 0) & (before >= cfg.outlook_streak_min)
    out["outlook"] = np.select([negative, positive], ["negative", "positive"], default="stable")
    return out.sort_index()


# --- watch --------------------------------------------------------------------------------


def watch(
    indexed: pd.DataFrame, events_ext: pd.DataFrame | None, cfg: RulesConfig | None = None
) -> pd.DataFrame:
    """Evento externo más reciente dentro de los últimos `watch_months`; prioridad por WATCH_KINDS."""
    cfg = cfg or RulesConfig()
    out = indexed.copy()
    out["watch"] = pd.Series([None] * len(out), index=out.index, dtype=object)
    if events_ext is None or events_ext.empty:
        return out
    unknown = set(events_ext["kind"]) - set(WATCH_KINDS)
    if unknown:
        raise ValueError(f"watch: kind desconocido {sorted(unknown)}; válidos: {WATCH_KINDS}")

    rank = {k: i for i, k in enumerate(WATCH_KINDS)}
    active: dict[tuple[str, str], str] = {}
    for cid, month, kind in events_ext[["company_id", "month", "kind"]].itertuples(index=False):
        for offset in range(cfg.watch_months):
            key = (cid, str(pd.Period(month, freq="M") + offset))
            if key not in active or rank[kind] < rank[active[key]]:
                active[key] = kind
    keys = list(zip(out["company_id"], out["month"].astype(str)))
    out["watch"] = pd.Series([active.get(k) for k in keys], index=out.index, dtype=object)
    return out


# --- confidence ---------------------------------------------------------------------------


def confidence(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """high / medium / low por meses de historial y señales presentes."""
    cfg = cfg or RulesConfig()
    out = indexed.copy()
    m, n = out["months_of_history"], out["n_signals"]
    high = (m >= cfg.confidence_high[0]) & (n >= cfg.confidence_high[1])
    medium = (m >= cfg.confidence_medium[0]) & (n >= cfg.confidence_medium[1])
    out["confidence"] = np.select([high, medium], ["high", "medium"], default="low")
    return out


# --- score y pipeline ---------------------------------------------------------------------


def score(
    indexed: pd.DataFrame,
    model: RulesModel,
    events_ext: pd.DataFrame | None = None,
    cfg: RulesConfig | None = None,
) -> pd.DataFrame:
    """Añade score, outlook, watch y confidence a una tabla que ya trae nivel (o índice)."""
    cfg = cfg or RulesConfig()
    out = indexed if "level" in indexed.columns else level(indexed, cfg)
    out = out.copy()
    out["score"] = model.predict(out["level"])
    out = outlook(out, cfg)
    out = watch(out, events_ext, cfg)
    out = confidence(out, cfg)
    return out


def run(
    features: pd.DataFrame,
    events_ext: pd.DataFrame | None = None,
    model: RulesModel | None = None,
    cfg: RulesConfig | None = None,
    train_until: str = "2025-08",
) -> pd.DataFrame:
    """features → tabla plana con rangos, rojos, índice, evento, etiqueta, nivel, score, outlook,
    watch y confidence. Ajusta el mapa isotónico si no recibe modelo (score.py); la API pasa uno."""
    from xray import labels  # aquí y no arriba: labels importa RulesConfig de este módulo

    cfg = cfg or RulesConfig()
    df = labels.rank_signals(features)
    df = labels.state_index(df, cfg)
    df = labels.events(df, cfg)
    df = labels.label_t6(df, cfg)
    df = level(df, cfg)
    if model is None:
        model = fit(df, cfg, train_until)
    return score(df, model, events_ext, cfg)
