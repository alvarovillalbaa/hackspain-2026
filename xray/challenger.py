"""Retadores sobre la etiqueta PD6 de rotura de caja (auditoría §8 W2.2; plan §4).

No son el score de producción: `xray-evals --challenger` los ajusta y los compara con las reglas
con la regla del plan §4 (≥ 0,03 de AUC(6) en GroupKFold sin perder estabilidad). Dos tipos sobre
la misma matriz de diseño: `gbm` (LightGBM con restricciones de monotonía) y `logistic` (scorecard
con coeficientes legibles). Leen la tabla indexada de `xray.labels` + `xray.rules.level` +
`xray.labels.label_pd6`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

KEYS = ["company_id", "month"]
SCORE_COL = "challenger_score"
KINDS = ("gbm", "logistic")

# columna → restricción de monotonía sobre la PD: +1 sube con la columna, −1 baja, 0 libre.
# Los rangos y el nivel van a 1 = más sana, así que la PD baja con ellos.
FEATURES: dict[str, int] = {
    "rank_balance": -1,
    "rank_overdue": -1,
    "rank_dscr": -1,
    "rank_inflows": -1,
    "level": -1,
    "momentum": -1,  # state_index − level: por encima de su media → menos riesgo
    "n_red": +1,
    "months_negative_6m": +1,
    "cash_buffer_days": -1,
    "overdue_flow_rate_3m": +1,
    "dscr_6m": -1,
    "net_cash_flow_ratio_3m": -1,
    "credit_line_usage": +1,
    "months_of_history": 0,
    "log_outflows": 0,
    "top_customer_share_12m": 0,
}


@dataclass(frozen=True)
class ChallengerConfig:
    """Hiperparámetros de la auditoría §8 W2.2 más el suavizado a 3 meses que exige."""

    kind: str = "gbm"  # "gbm" | "logistic"
    n_estimators: int = 400
    learning_rate: float = 0.03
    num_leaves: int = 15
    min_child_samples: int = 80
    subsample: float = 0.8
    subsample_freq: int = 1
    colsample_bytree: float = 0.8
    logistic_c: float = 1.0
    smooth_window: int = 3
    strict: bool = False  # True: solo filas con month + horizon ≤ train_until
    horizon: int = 6
    random_state: int = 0
    min_positives: int = 20


def _month_plus(month: pd.Series, k: int) -> pd.Series:
    return pd.Series((pd.PeriodIndex(month.astype(str), freq="M") + k).astype(str), index=month.index)


def design_matrix(indexed: pd.DataFrame) -> pd.DataFrame:
    """Matriz de diseño con las columnas de FEATURES, en float y con NaN donde falte cobertura."""
    cols: dict[str, np.ndarray] = {}
    for col in FEATURES:
        if col == "momentum":
            cols[col] = (indexed["state_index"] - indexed["level"]).to_numpy(dtype=float)
        elif col == "log_outflows":
            cols[col] = np.log1p(pd.to_numeric(indexed["outflows_eur"], errors="coerce").clip(lower=0).to_numpy(dtype=float))
        else:
            cols[col] = pd.to_numeric(indexed[col], errors="coerce").to_numpy(dtype=float)
    return pd.DataFrame(cols, index=indexed.index)


@dataclass
class ChallengerModel:
    booster: object  # LGBMClassifier o Pipeline logístico
    cfg: ChallengerConfig
    train_until: str
    n_train: int
    n_pos: int
    feature_names: list[str] = field(default_factory=lambda: list(FEATURES))

    def predict_pd6(self, indexed: pd.DataFrame) -> np.ndarray:
        x = design_matrix(indexed)[self.feature_names]
        return self.booster.predict_proba(x)[:, 1]

    def feature_importance(self) -> pd.Series:
        """GBM: ganancia por variable (≥ 0). Logístico: coeficiente sobre la variable estandarizada
        (signo legible: negativo = protege)."""
        if self.cfg.kind == "logistic":
            values = self.booster.named_steps["clf"].coef_[0]
        else:
            values = self.booster.booster_.feature_importance(importance_type="gain")
        return pd.Series(values, index=self.feature_names, dtype=float)

    def save(self, path: str | Path) -> None:
        joblib.dump({"booster": self.booster, "cfg": asdict(self.cfg), "train_until": self.train_until,
                     "n_train": self.n_train, "n_pos": self.n_pos, "feature_names": self.feature_names}, path)

    @classmethod
    def load(cls, path: str | Path) -> ChallengerModel:
        d = joblib.load(path)
        return cls(booster=d["booster"], cfg=ChallengerConfig(**d["cfg"]), train_until=d["train_until"],
                   n_train=d["n_train"], n_pos=d["n_pos"], feature_names=list(d["feature_names"]))


def training_rows(indexed: pd.DataFrame, cfg: ChallengerConfig, train_until: str) -> pd.Series:
    """Máscara de filas de train: etiqueta presente y mes ≤ train_until (estricto: etiqueta cerrada
    dentro de train, mes + horizon ≤ train_until)."""
    month = indexed["month"].astype(str)
    mask = indexed["label_pd6"].notna() & (month <= train_until)
    if cfg.strict:
        mask &= _month_plus(month, cfg.horizon) <= train_until
    return mask


def _estimator(cfg: ChallengerConfig, columns: list[str]):
    if cfg.kind == "logistic":
        return Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(C=cfg.logistic_c, max_iter=2000)),
        ])
    if cfg.kind != "gbm":
        raise ValueError(f"challenger: kind {cfg.kind!r} no está en {KINDS}")
    return LGBMClassifier(
        objective="binary",
        n_estimators=cfg.n_estimators,
        learning_rate=cfg.learning_rate,
        num_leaves=cfg.num_leaves,
        min_child_samples=cfg.min_child_samples,
        subsample=cfg.subsample,
        subsample_freq=cfg.subsample_freq,
        colsample_bytree=cfg.colsample_bytree,
        monotone_constraints=[FEATURES[c] for c in columns],
        monotone_constraints_method="advanced",
        random_state=cfg.random_state,
        verbose=-1,
    )


def fit(indexed: pd.DataFrame, cfg: ChallengerConfig | None = None, train_until: str = "2025-08") -> ChallengerModel:
    cfg = cfg or ChallengerConfig()
    mask = training_rows(indexed, cfg, train_until)
    x = design_matrix(indexed.loc[mask])
    y = indexed.loc[mask, "label_pd6"].astype(int)
    if int(y.sum()) < cfg.min_positives:
        raise ValueError(f"challenger.fit: {int(y.sum())} positivos en train (< {cfg.min_positives}); "
                         "hacen falta más filas con label_pd6 = 1")
    booster = _estimator(cfg, list(x.columns))
    booster.fit(x, y)
    return ChallengerModel(booster=booster, cfg=cfg, train_until=train_until, n_train=int(mask.sum()),
                           n_pos=int(y.sum()), feature_names=list(x.columns))


def smooth(indexed: pd.DataFrame, col: str, window: int) -> pd.Series:
    """Media móvil por empresa de los últimos `window` meses disponibles; alineada al índice."""
    tmp = indexed[KEYS + [col]].reset_index(drop=True)
    tmp["_pos"] = np.arange(len(tmp))
    tmp = tmp.sort_values(KEYS)
    sm = tmp.groupby("company_id", sort=False)[col].transform(lambda v: v.rolling(window, min_periods=1).mean())
    result = np.empty(len(tmp), dtype=float)
    result[tmp["_pos"].to_numpy()] = sm.to_numpy()
    return pd.Series(result, index=indexed.index)


def score(indexed: pd.DataFrame, model: ChallengerModel, cfg: ChallengerConfig | None = None) -> pd.DataFrame:
    """Añade pd6_raw, pd6 (suavizada) y challenger_score = 100 × (1 − pd6)."""
    cfg = cfg or model.cfg
    out = indexed.copy()
    out["pd6_raw"] = model.predict_pd6(out)
    out["pd6"] = smooth(out, "pd6_raw", cfg.smooth_window)
    out[SCORE_COL] = 100.0 * (1.0 - out["pd6"])
    return out
