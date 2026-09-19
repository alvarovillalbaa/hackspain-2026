"""Propensión a contratar financiación (experimento A3 de docs/experimentos_productos.md).

Cruza el panel puntuado (`xray.rules.run`) con los eventos de adopción (`xray.adoption`) y lo
convierte en un objetivo binario «¿contrata este producto en los próximos `horizon` meses?», que
un LightGBM aprende con validación por grupos de empresa.

Es la política de comportamiento de referencia: de aquí salen los pesos de propensión que usan los
estimadores fuera de política y el solape treated/control de A3. No toca el score ni las bandas.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

FEATURE_COLS = [
    "months_of_history", "operating_inflows_eur", "outflows_eur", "eom_balance_eur",
    "min_balance_eur", "months_negative_6m", "overdue_received_ratio_3m", "dscr_6m",
    "net_cash_flow_ratio_3m", "cash_buffer_days", "overdue_flow_rate_3m", "credit_line_usage",
    "top_customer_share_12m", "rank_balance", "rank_overdue", "rank_dscr", "rank_inflows",
    "state_index", "n_red", "level", "score",
]
"""Entradas del modelo: el contrato de features más lo que añade `xray.rules.run`."""

PARAMS: dict = {
    "n_estimators": 300,
    "learning_rate": 0.03,
    "num_leaves": 15,
    "min_child_samples": 50,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "verbose": -1,
}


@dataclass
class PropensityResult:
    """Modelo de propensión ya ajustado, con sus métricas y las probabilidades fuera de fold.

    `oof` va indexado como las filas en riesgo que devuelve `adoption_target` sobre el mismo panel,
    para poder pegarlo al panel sin reordenar nada; es NaN en los folds que no llegaron a correr.
    """

    product: str
    horizon: int
    n_rows: int
    n_pos: int
    auc_mean: float
    auc_std: float
    oof: pd.Series
    importance: pd.Series
    model: object


def _month_ordinal(month: pd.Series) -> pd.Series:
    """Mes 'YYYY-MM' → entero; la resta de dos ordinales es la distancia en meses."""
    return pd.Series(pd.PeriodIndex(month.astype(str), freq="M").asi8, index=month.index)


def _model(seed: int) -> LGBMClassifier:
    return LGBMClassifier(random_state=seed, importance_type="gain", **PARAMS)


def _row_groups(rows: pd.DataFrame, groups: pd.Series) -> np.ndarray:
    """Grupo de cada fila. `groups` vale como mapa company_id → grupo o como serie por fila."""
    company = rows["company_id"]
    if company.isin(groups.index).all():
        return company.map(groups).to_numpy()
    return groups.loc[rows.index].to_numpy()


def adoption_target(
    panel: pd.DataFrame, events: pd.DataFrame, product: str, horizon: int = 3
) -> pd.DataFrame:
    """Filas del panel «en riesgo» de contratar `product`, con la etiqueta `y`.

    Una fila está en riesgo si la empresa todavía no ha contratado el producto (nunca lo hace, o el
    mes es anterior a su primer evento) y quedan al menos `horizon` meses de panel por delante para
    poder observar el desenlace. Ese futuro se mide contra el último mes de la empresa en el panel
    **completo**, no entre las filas en riesgo: si no, el mes anterior a la contratación se caería
    siempre por falta de futuro y desaparecerían los positivos más informativos.

    `y` vale 1 cuando el primer evento cae en (t, t + horizon]. Devuelve las columnas del panel más
    `y`, conservando su índice y su orden.
    """
    month = _month_ordinal(panel["month"])
    last = month.groupby(panel["company_id"], sort=False).transform("max")  # panel completo
    ev = events.loc[events["product"].eq(product), ["company_id", "month"]]
    first = _month_ordinal(ev["month"]).groupby(ev["company_id"], sort=False).min()
    event = panel["company_id"].map(first).astype("float64")  # NaN si nunca contrata
    ahead = event - month  # NaN nunca entra en el rango: los que no contratan son negativos

    at_risk = (event.isna() | (month < event)) & ((last - month) >= horizon)
    in_horizon = ((ahead >= 1) & (ahead <= horizon)).astype(int)
    out = panel[at_risk].copy()
    out["y"] = in_horizon[at_risk].to_numpy()
    return out


def fit_propensity(
    panel: pd.DataFrame,
    events: pd.DataFrame,
    product: str,
    groups: pd.Series,
    horizon: int = 3,
    n_splits: int = 5,
    seed: int = 0,
) -> PropensityResult:
    """Entrena la propensión a contratar `product` con GroupKFold sobre `groups`.

    Un fold sin positivos en train o en test no corre: no hay nada que aprender ni AUC que medir, y
    sus filas se quedan sin probabilidad fuera de fold. El modelo final se reajusta siempre sobre
    todas las filas en riesgo.
    """
    rows = adoption_target(panel, events, product, horizon)
    x, y = rows[FEATURE_COLS], rows["y"].to_numpy()
    oof = pd.Series(np.nan, index=rows.index, dtype="float64")
    aucs: list[float] = []

    for train, test in GroupKFold(n_splits=n_splits).split(x, y, _row_groups(rows, groups)):
        if y[train].sum() == 0 or y[test].sum() == 0:
            continue
        fold = _model(seed).fit(x.iloc[train], y[train])
        probability = fold.predict_proba(x.iloc[test])[:, 1]
        oof.iloc[test] = probability
        aucs.append(float(roc_auc_score(y[test], probability)))

    model = _model(seed).fit(x, y)
    importance = pd.Series(model.feature_importances_, index=FEATURE_COLS)
    return PropensityResult(
        product=product,
        horizon=horizon,
        n_rows=len(rows),
        n_pos=int(y.sum()),
        auc_mean=float(np.mean(aucs)) if aucs else float("nan"),
        auc_std=float(np.std(aucs)) if aucs else float("nan"),
        oof=oof,
        importance=importance.sort_values(ascending=False),
        model=model,
    )


def predict_propensity(result: PropensityResult, panel: pd.DataFrame) -> np.ndarray:
    """Probabilidad de contratar en los próximos `horizon` meses, fila a fila.

    Puntúa lo que se le pase: no aplica la máscara de riesgo de `adoption_target`.
    """
    return result.model.predict_proba(panel[FEATURE_COLS])[:, 1]
