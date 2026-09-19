"""Eventos externos de watch desde los CSV (slice 14, #31): `events_ext(company_id, month, kind)`.

Tres códigos, los de `rules.WATCH_KINDS`:

- `main_customer_lost`: un cliente recurrente (factura emitida en ≥ `recurrence_months` de los
  últimos `window_months`) que pesaba ≥ `min_share` de la facturación emitida de esa ventana y no
  factura en los últimos `absence_months` meses (t incluido). Evento en el primer mes que cumple;
  no se repite mientras siga cumpliendo (mismo episodio).
- `large_maturity`: contrato de `debt_schedule_config` cuyo último pago cae en los
  `maturity_days` días siguientes al fin del mes t, con saldo pendiente ≥
  `maturity_min_outflow_months` meses de cargos (media de 3 meses de `outflows_eur`). Evento en
  el primer mes dentro de la ventana que cumple el saldo, una vez por contrato. Solo existe con
  cuadro de amortización.
- `expensive_new_debt`: producto de deuda dado de alta con tipo de contrato por encima del
  percentil `expensive_percentile` de los tipos de contrato de la tabla. Evento en el mes del alta;
  sin contrato no hay evento (nulo, no estimado; `interest_charge` no sirve, plan §5). El percentil
  se calcula sobre la tabla que recibe el llamador: con menos de `expensive_min_contracts`
  contratos con tipo no hay referencia y el evento no se emite (en ingest/packs la tabla es la del
  propio pack, así que allí prácticamente nunca dispara; la referencia es la de la cartera).

Determinista y sin mirar el futuro: lo que ocurre en t solo usa filas con fecha ≤ fin de t. La
rejilla es la de la tabla de features (empresa, mes): fuera de ella no se emiten eventos.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from xray import features as features_mod

KEYS = ["company_id", "month"]
COLUMNS = ["company_id", "month", "kind"]


@dataclass(frozen=True)
class EventsConfig:
    """Umbrales de los tres eventos; los valores por defecto son los del plan §2/§5."""

    window_months: int = 12  # ventana de recurrencia y de cuota del cliente
    recurrence_months: int = 6  # meses con factura dentro de la ventana para ser recurrente
    min_share: float = 0.20  # cuota mínima de la facturación emitida de la ventana
    absence_months: int = 3  # meses seguidos sin factura (t incluido) para darlo por perdido
    maturity_days: int = 90  # vencimiento dentro de estos días tras el fin de mes
    maturity_min_outflow_months: float = 1.0  # saldo pendiente mínimo, en meses de cargos
    expensive_percentile: float = 75.0  # percentil de los tipos de contrato que define «caro»
    expensive_min_contracts: int = 4  # contratos con tipo mínimos para que el percentil sea referencia


def _empty() -> pd.DataFrame:
    return pd.DataFrame(columns=COLUMNS)


def _grid(features: pd.DataFrame) -> pd.DataFrame:
    grid = features[KEYS].copy()
    grid["month"] = pd.PeriodIndex(grid["month"].astype(str), freq="M")
    return grid.drop_duplicates(KEYS).sort_values(KEYS).reset_index(drop=True)


def _in_grid(rows: pd.DataFrame, grid: pd.DataFrame, kind: str) -> pd.DataFrame:
    if len(rows) == 0 or len(grid) == 0:
        return _empty()
    out = rows[KEYS].merge(grid, on=KEYS, how="inner").drop_duplicates(KEYS)
    out["kind"] = kind
    out["month"] = out["month"].astype(str)
    return out[COLUMNS]


def main_customer_lost(invoices: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Cliente recurrente y grande que deja de facturar `absence_months` meses seguidos."""
    if len(invoices) == 0 or len(grid) == 0 or not {"amount", "counterparty_id", "issuance_date"} <= set(invoices.columns):
        return _empty()
    inv = features_mod.invoice_rows(invoices)
    inv = inv.assign(issuance_date=pd.to_datetime(inv["issuance_date"], errors="coerce"))
    iss = inv[(inv["direction"] == "issued") & inv["counterparty_id"].notna() & inv["issuance_date"].notna()]
    if len(iss) == 0:
        return _empty()
    months = pd.period_range(grid["month"].min(), grid["month"].max(), freq="M")
    iss = iss.assign(month=iss["issuance_date"].dt.to_period("M"), a=iss["amount"].abs())
    iss = iss[iss["month"].isin(months)]
    if len(iss) == 0:
        return _empty()
    amounts = (
        iss.groupby(["company_id", "counterparty_id", "month"])["a"].sum()
        .unstack().reindex(columns=months).fillna(0.0)
    )
    present = amounts.gt(0).astype(int)
    active_months = present.T.rolling(cfg.window_months, min_periods=1).sum().T
    amount_w = amounts.T.rolling(cfg.window_months, min_periods=1).sum().T
    company_w = amount_w.groupby(level="company_id").transform("sum")
    share = amount_w / company_w.where(company_w > 0)
    recent = present.T.rolling(cfg.absence_months, min_periods=cfg.absence_months).sum().T
    qualifies = (active_months >= cfg.recurrence_months) & (share >= cfg.min_share) & (recent == 0)
    starts = qualifies & ~qualifies.shift(1, axis=1).fillna(False).astype(bool)
    stacked = starts.stack()
    rows = stacked[stacked].reset_index()
    rows.columns = ["company_id", "counterparty_id", "month", "flag"]
    return _in_grid(rows, grid, "main_customer_lost")


def large_maturity(schedule: pd.DataFrame, features: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Vencimiento de contrato dentro de `maturity_days` tras el fin de mes, con saldo grande."""
    need = {"product_id", "company_id", "last_payment_date", "outstanding_balance"}
    if len(schedule) == 0 or len(grid) == 0 or not need <= set(schedule.columns):
        return _empty()
    sched = schedule[list(need)].dropna(subset=["product_id", "company_id", "last_payment_date", "outstanding_balance"]).copy()
    sched["last_payment_date"] = pd.to_datetime(sched["last_payment_date"], errors="coerce")
    sched["outstanding_balance"] = pd.to_numeric(sched["outstanding_balance"], errors="coerce")
    sched = sched[sched["last_payment_date"].notna() & (sched["outstanding_balance"].abs() > 0)]
    if len(sched) == 0:
        return _empty()
    feats = features[KEYS + ["outflows_eur"]].copy()
    feats["month"] = pd.PeriodIndex(feats["month"].astype(str), freq="M")
    feats = feats.sort_values(KEYS)
    feats["outflows_3m"] = feats.groupby("company_id")["outflows_eur"].transform(
        lambda s: s.rolling(3, min_periods=1).mean()
    )
    cross = feats.merge(sched, on="company_id")
    if len(cross) == 0:
        return _empty()
    month_end = cross["month"].dt.end_time.dt.normalize()
    days = (cross["last_payment_date"].dt.normalize() - month_end).dt.days
    big = cross["outstanding_balance"].abs() >= cfg.maturity_min_outflow_months * cross["outflows_3m"].fillna(0.0)
    cross["flag"] = (days > 0) & (days <= cfg.maturity_days) & big
    # una vez por contrato: el primer mes dentro de la ventana que cumple el saldo
    first = cross[cross["flag"]].groupby(["company_id", "product_id"], as_index=False)["month"].min()
    return _in_grid(first, grid, "large_maturity")


def expensive_new_debt(debt: pd.DataFrame, schedule: pd.DataFrame, grid: pd.DataFrame, cfg: EventsConfig) -> pd.DataFrame:
    """Alta de deuda con tipo de contrato por encima del percentil de los contratos de la tabla."""
    if len(debt) == 0 or len(schedule) == 0 or len(grid) == 0:
        return _empty()
    if not {"product_id", "company_id", "created_at"} <= set(debt.columns):
        return _empty()
    if not {"product_id", "annual_interest_rate_or_spread"} <= set(schedule.columns):
        return _empty()
    rates = schedule.dropna(subset=["product_id", "annual_interest_rate_or_spread"]).copy()
    rates["annual_interest_rate_or_spread"] = pd.to_numeric(rates["annual_interest_rate_or_spread"], errors="coerce")
    rates = rates.dropna(subset=["annual_interest_rate_or_spread"])
    rates = rates.sort_values("annual_interest_rate_or_spread").drop_duplicates("product_id")
    rates = rates[["product_id", "annual_interest_rate_or_spread"]]
    if len(rates) < cfg.expensive_min_contracts:
        return _empty()
    threshold = float(np.percentile(rates["annual_interest_rate_or_spread"], cfg.expensive_percentile))
    new = debt.dropna(subset=["product_id", "company_id", "created_at"]).merge(rates, on="product_id")
    new = new.assign(created_at=pd.to_datetime(new["created_at"], errors="coerce"))
    new = new[new["created_at"].notna() & (new["annual_interest_rate_or_spread"] > threshold)]
    if len(new) == 0:
        return _empty()
    rows = pd.DataFrame({"company_id": new["company_id"].to_numpy(), "month": new["created_at"].dt.to_period("M").to_numpy()})
    return _in_grid(rows, grid, "expensive_new_debt")


def build(tables: dict[str, pd.DataFrame], features: pd.DataFrame, cfg: EventsConfig | None = None) -> pd.DataFrame:
    """Tabla `events_ext` para la rejilla (empresa, mes) de `features`, lista para `rules.run`."""
    cfg = cfg or EventsConfig()
    grid = _grid(features)
    empty = pd.DataFrame()
    parts = [
        main_customer_lost(tables.get("invoices", empty), grid, cfg),
        large_maturity(tables.get("debt_schedule_config", empty), features, grid, cfg),
        expensive_new_debt(tables.get("debt_products", empty), tables.get("debt_schedule_config", empty), grid, cfg),
    ]
    parts = [p for p in parts if len(p)]
    if not parts:
        return _empty()
    out = pd.concat(parts, ignore_index=True)
    return out.sort_values(COLUMNS).reset_index(drop=True)
