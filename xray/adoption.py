"""Eventos de adopción de productos de financiación desde los movimientos (experimento A1).

`created_at` de `debt_products` es fecha de conexión a la plataforma, no de originación
(docs/experimentos_productos.md §2.2), así que la fuente principal son los movimientos y
`created_at` queda como fuente secundaria.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

PRODUCTS = ("loan", "line", "factoring", "anticipo", "confirming", "disposicion")
SOURCES = ("installment", "step_up", "line_tx", "description", "created_at")
COLUMNS = ["company_id", "month", "product", "source", "amount_eur", "pre_months", "post_months"]
STEP_UP_FACTOR = 1.5
_DESC_RULES = {  # producto → (palabra, sólo abonos, categorías permitidas, subcadenas excluidas)
    "factoring": ("FACTORING", True, None, ()),
    "anticipo": ("ANTICIPO", True, ("collection", "-", "transfer"), ("DEVOL",)),
    "disposicion": ("DISPOSICION", True, None, ()),
    "confirming": ("CONFIRMING", False, None, ()),
}
_CREATED_MAP = {
    "loan": "loan",
    "lineofcredit": "line",
    "factoring": "factoring",
    "confirming": "confirming",
}


def _month(dates: pd.Series) -> pd.Series:
    return dates.dt.to_period("M").astype(str)


def monthly_debt_service(transactions: pd.DataFrame) -> pd.DataFrame:
    """Cuota pagada por mes: |suma| de los movimientos `debt_repayment` (sólo meses con cargo)."""
    t = transactions[transactions["category"].eq("debt_repayment")]
    out = (
        t.assign(month=_month(t["date"]), a=t["amount"].abs())
        .groupby(["company_id", "month"], as_index=False)["a"]
        .sum()
    )
    return out.rename(columns={"a": "debt_service_eur"})


def _first_month(sub: pd.DataFrame, product: str, source: str) -> pd.DataFrame:
    """Primer mes con la traza por empresa; amount = suma de abonos (>0) de ese mes."""
    if sub.empty:
        return pd.DataFrame(columns=["company_id", "month", "product", "source", "amount_eur"])
    sub = sub.assign(month=_month(sub["date"]))
    first = sub.groupby("company_id")["month"].min().rename("month").reset_index()
    pos = (
        sub[sub["amount"] > 0]
        .groupby(["company_id", "month"])["amount"]
        .sum()
        .rename("amount_eur")
        .reset_index()
    )
    out = first.merge(pos, how="left").fillna({"amount_eur": 0.0})
    return out.assign(product=product, source=source)[
        ["company_id", "month", "product", "source", "amount_eur"]
    ]


def _step_ups(ds: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    """Salto de cuota: la mediana de los tres meses previos se multiplica y se sostiene."""
    base = (
        features[["company_id", "month"]]
        .merge(ds, how="left")
        .fillna({"debt_service_eur": 0.0})
        .sort_values(["company_id", "month"])
    )
    g = base.groupby("company_id")["debt_service_eur"]
    prev_med = g.transform(lambda s: s.shift(1).rolling(3, min_periods=3).median())
    next_min = g.transform(lambda s: s.rolling(3, min_periods=3).min().shift(-2))
    hit = (prev_med > 0) & (next_min > STEP_UP_FACTOR * prev_med)
    out = base.loc[hit, ["company_id", "month"]].copy()
    out["amount_eur"] = (base.loc[hit, "debt_service_eur"] - prev_med[hit]).to_numpy()
    return out.assign(product="loan", source="step_up")


def adoption_events(
    transactions: pd.DataFrame,
    debt_products: pd.DataFrame,
    banking_products: pd.DataFrame,
    features: pd.DataFrame,
) -> pd.DataFrame:
    """Una fila por evento detectado (`COLUMNS`), siempre dentro de la historia de `features`."""
    tx = transactions
    ptype = (
        pd.concat([banking_products[["product_id", "type"]], debt_products[["product_id", "type"]]])
        .drop_duplicates("product_id")
        .set_index("product_id")["type"]
    )
    desc = tx["description"].fillna("").str.upper()
    installments = tx[tx["category"].eq("debt_repayment")].assign(amount=tx["amount"].abs())
    parts = [_first_month(installments, "loan", "installment")]
    parts.append(_step_ups(monthly_debt_service(tx), features))
    lines = tx[tx["product_id"].map(ptype).eq("lineofcredit")]
    parts.append(_first_month(lines, "line", "line_tx"))
    for product, (kw, positive_only, cats, excluded) in _DESC_RULES.items():
        m = desc.str.contains(kw, regex=False)
        if positive_only:
            m &= tx["amount"] > 0
        if cats is not None:
            m &= tx["category"].isin(cats)
        for ex in excluded:
            m &= ~desc.str.contains(ex, regex=False)
        parts.append(_first_month(tx[m], product, "description"))
    dp = debt_products[debt_products["type"].isin(_CREATED_MAP)].copy()
    dp["product"] = dp["type"].map(_CREATED_MAP)
    dp["month"] = _month(dp["created_at"])
    dp = dp.sort_values("created_at").drop_duplicates(["company_id", "product"])
    parts.append(
        dp.assign(source="created_at", amount_eur=dp["granted"].abs())[
            ["company_id", "month", "product", "source", "amount_eur"]
        ]
    )
    ev = pd.concat(parts, ignore_index=True)
    # sólo meses dentro de la historia de features; pre/post en meses
    fm = features.assign(mp=pd.PeriodIndex(features["month"].astype(str), freq="M"))
    span = fm.groupby("company_id")["mp"].agg(["min", "max"])
    ev = ev.merge(span, left_on="company_id", right_index=True, how="inner")
    mp = pd.PeriodIndex(ev["month"].astype(str), freq="M")
    ev["pre_months"] = np.array([(m - a).n for m, a in zip(mp, ev["min"])])
    ev["post_months"] = np.array([(b - m).n for m, b in zip(mp, ev["max"])])
    ev = ev[(ev["pre_months"] >= 0) & (ev["post_months"] >= 0)]
    ev["amount_eur"] = ev["amount_eur"].astype(float)  # NaN si falta `granted`
    order = ["company_id", "product", "source", "month"]
    return ev[COLUMNS].sort_values(order).reset_index(drop=True)


def clean_events(
    events: pd.DataFrame,
    product: str | None = None,
    source: str | None = None,
    min_pre: int = 6,
    min_post: int = 6,
) -> pd.DataFrame:
    """Filtra por producto/fuente (None = todos), exige ventana pre/post y deja el primer evento."""
    ev = events
    if product is not None:
        ev = ev[ev["product"].eq(product)]
    if source is not None:
        ev = ev[ev["source"].eq(source)]
    ev = ev[(ev["pre_months"] >= min_pre) & (ev["post_months"] >= min_post)]
    first = ev.sort_values("month").drop_duplicates(["company_id", "product", "source"])
    return first.reset_index(drop=True)
