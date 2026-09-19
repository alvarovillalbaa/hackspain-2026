"""Score por reglas calibradas (slice #15). Especificación: docs/rules_spec.md.

Nivel → mapa isotónico → score 0–100 y abanico a t+6 por tramo de nivel; outlook por persistencia;
watch desde eventos externos; confidence por historial y cobertura. Solo lee la salida de
`xray.labels`.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from xray.profile import RankProfile

KEYS = ["company_id", "month"]
WATCH_KINDS = ("large_maturity", "main_customer_lost", "expensive_new_debt")  # orden = prioridad
PROJECTION_COLUMNS = ["proj_p10", "proj_p50", "proj_p90"]  # cuantiles del score a t+6, en puntos


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
    outlook_streak_min: int = 1  # rojos en los 3 anteriores para que cuente como racha (1 desde el 19 sep)
    trend_window: int = 3  # meses de (índice − nivel) que promedia trend
    trend_threshold: float = 0.10  # |momentum| por encima del cual trend deja de ser flat
    watch_months: int = 3  # meses que dura un watch, el del evento incluido
    lead_percentile: float = 20.0  # percentil de scores de train que define lead_cutoff
    projection_bins: int = 20  # tramos de nivel (cuantiles de train) para el abanico a t+6
    projection_min_rows: int = 30  # filas de train por tramo; con menos filas, menos tramos
    projection_quantiles: tuple[float, float, float] = (0.10, 0.50, 0.90)
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
    """Mapa nivel → E[nivel a t+6] como nudos de una función monótona, en escala 0–100, más el
    perfil de rangos por mes de la población de referencia (`rank_profile`, 19 sep) con el que se
    ranquean las empresas nuevas."""

    knots_x: list[float]
    knots_y: list[float]
    train_until: str
    lead_cutoff: float
    n_train: int
    rank_profile: dict | None = None
    projection_edges: list[float] | None = None  # cortes de nivel de los tramos (len = tramos + 1)
    projection_points: list[list[float]] | None = None  # por tramo: [p10, p50, p90] del score a t+6

    def predict(self, level: np.ndarray | pd.Series) -> np.ndarray:
        x = np.asarray(level, dtype=float)
        return np.interp(x, self.knots_x, self.knots_y)  # clip en los extremos; NaN → NaN

    def profile(self) -> RankProfile | None:
        return RankProfile.from_dict(self.rank_profile) if self.rank_profile else None

    def project(self, level: np.ndarray | pd.Series) -> np.ndarray:
        """Cuantiles del score a t+6 (n, 3) según el tramo de nivel de hoy; nivel NaN → fila NaN."""
        if self.projection_edges is None or self.projection_points is None:
            raise ValueError("RulesModel sin proyección a t+6: vuelve a ajustar con `uv run xray-score`")
        x = np.asarray(level, dtype=float)
        edges = np.asarray(self.projection_edges, dtype=float)
        points = np.asarray(self.projection_points, dtype=float)
        idx = np.clip(np.searchsorted(edges[1:-1], x, side="right"), 0, len(points) - 1)
        out = points[idx].astype(float)
        out[np.isnan(x)] = np.nan
        return out

    def save(self, path: str | Path) -> None:
        # compacto: el perfil guarda ~100 k valores y con indent ocuparía megabytes de saltos de línea
        Path(path).write_text(json.dumps(asdict(self), separators=(",", ":")), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> RulesModel:
        model = cls(**json.loads(Path(path).read_text(encoding="utf-8")))
        if model.projection_edges is None or model.projection_points is None:
            raise ValueError(
                f"{path}: RulesModel sin proyección a t+6 (modelo anterior al slice 14); "
                "regenera con `uv run xray-score --features artifacts/features.parquet`"
            )
        return model


def _fit_projection(
    train: pd.DataFrame, model: RulesModel, cfg: RulesConfig
) -> tuple[list[float], list[list[float]]]:
    """Cuantiles de la etiqueta por tramo de nivel, pasados por el mapa: como el mapa es monótono y
    nivel(t+6) = etiqueta(t) (model_card.md §4), son los cuantiles del score dentro de 6 meses."""
    level = train["level"].to_numpy(dtype=float)
    label = train["label_t6"].to_numpy(dtype=float)
    bins = max(1, min(cfg.projection_bins, len(train) // cfg.projection_min_rows))
    edges = np.unique(np.quantile(level, np.linspace(0.0, 1.0, bins + 1)))
    if len(edges) < 2:
        edges = np.array([edges[0], edges[0]])
    idx = np.clip(np.searchsorted(edges[1:-1], level, side="right"), 0, len(edges) - 2)
    points: list[list[float]] = []
    for b in range(len(edges) - 1):
        rows = label[idx == b]
        if len(rows) == 0:
            rows = label
        q = np.quantile(rows, cfg.projection_quantiles)
        points.append([float(v) for v in model.predict(q)])
    return [float(e) for e in edges], points


def fit(indexed: pd.DataFrame, cfg: RulesConfig | None = None, train_until: str = "2025-08") -> RulesModel:
    """Ajusta el mapa isotónico sobre las filas con `month ≤ train_until` y etiqueta."""
    cfg = cfg or RulesConfig()
    train = indexed[(indexed["month"].astype(str) <= train_until)].dropna(subset=["level", "label_t6"])
    if len(train) < 2:
        raise ValueError(f"fit: solo {len(train)} filas de train hasta {train_until}")
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(train["level"].to_numpy(), train["label_t6"].to_numpy())
    from xray import labels  # aquí y no arriba: labels importa RulesConfig de este módulo

    model = RulesModel(
        knots_x=[float(v) for v in iso.X_thresholds_],
        knots_y=[float(v) * 100 for v in iso.y_thresholds_],
        train_until=train_until,
        lead_cutoff=0.0,
        n_train=len(train),
        rank_profile=RankProfile.fit(indexed, labels.SIGNALS).to_dict(),  # todos los meses, no solo train
    )
    model.lead_cutoff = float(np.percentile(model.predict(train["level"]), cfg.lead_percentile))
    model.projection_edges, model.projection_points = _fit_projection(train, model, cfg)
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


# --- trend --------------------------------------------------------------------------------


def trend(indexed: pd.DataFrame, cfg: RulesConfig | None = None) -> pd.DataFrame:
    """improving / flat / worsening: media de (índice − nivel) en los últimos `trend_window` meses
    frente a ±`trend_threshold`. Es la capa rápida frente al nivel suavizado; no toca el score.
    Sin `trend_window` meses de índice es flat."""
    cfg = cfg or RulesConfig()
    out = indexed.sort_values(KEYS).copy()
    gap = out["state_index"] - out["level"]
    mom = gap.groupby(out["company_id"], sort=False).transform(
        lambda s: s.rolling(cfg.trend_window, min_periods=cfg.trend_window).mean()
    )
    out["trend"] = np.select(
        [mom > cfg.trend_threshold, mom < -cfg.trend_threshold], ["improving", "worsening"], default="flat"
    )
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
    """Añade score, abanico a t+6, outlook, trend, watch y confidence a una tabla que ya trae nivel
    (o índice)."""
    cfg = cfg or RulesConfig()
    out = indexed if "level" in indexed.columns else level(indexed, cfg)
    out = out.copy()
    out["score"] = model.predict(out["level"])
    proj = model.project(out["level"])
    for i, col in enumerate(PROJECTION_COLUMNS):
        out[col] = proj[:, i]
    out = outlook(out, cfg)
    out = trend(out, cfg)
    out = watch(out, events_ext, cfg)
    out = confidence(out, cfg)
    return out


def run(
    features: pd.DataFrame,
    events_ext: pd.DataFrame | None = None,
    model: RulesModel | None = None,
    cfg: RulesConfig | None = None,
    train_until: str = "2025-08",
    rank_against: RankProfile | None = None,
) -> pd.DataFrame:
    """features → tabla plana con rangos, rojos, índice, evento, etiqueta, nivel, score, outlook,
    trend, watch y confidence. Ajusta el mapa isotónico si no recibe modelo (score.py); la API pasa
    uno. Con `rank_against` (el perfil del modelo) las filas se ranquean contra la referencia: es el
    camino de las empresas nuevas."""
    from xray import labels  # aquí y no arriba: labels importa RulesConfig de este módulo

    cfg = cfg or RulesConfig()
    df = labels.rank_signals(features, profile=rank_against)
    df = labels.state_index(df, cfg)
    df = labels.events(df, cfg)
    df = labels.label_t6(df, cfg)
    df = level(df, cfg)
    if model is None:
        model = fit(df, cfg, train_until)
    return score(df, model, events_ext, cfg)
