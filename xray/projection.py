"""Simulador mensual de caja con mecánica de productos, calibración y backtest (experimento B1).

Responde a la pregunta del asesor: *si esta empresa no hace nada, ¿con qué probabilidad se queda
en descubierto en los próximos 6 meses, y cuánto cambia esa probabilidad (y a qué coste) si abre
una póliza, hace factoring, pide un préstamo o refinancia?*

El motor es Monte Carlo sobre la propia historia de la empresa: cada mes del horizonte se sortea
un triplete `(entradas, salidas, bache intramensual)` de los últimos `history_months` meses; con
historia corta parte de los sorteos viene de un pool normalizado de empresas comparables
(`FlowPool`). Sobre esa trayectoria se aplica la mecánica del producto y se mide lo que le importa
al asesor: `breach_prob` (probabilidad de saldo mínimo negativo), `expected_cost` (coste financiero
en euros) y `dscr_fail_prob`.

Recursión mensual (mes j, vectorizada sobre caminos):

    eom_j  = eom_{j−1} + in_j − out_j + cash_j − cost_caja_j − cuota_nueva_j
    min_j  = eom_j − dip_j
    (línea) si el mes cubre descubierto: se dispone lo justo, sube eom_j y min_j, y el interés
            del dispuesto acumulado se contabiliza en cost_j
    (descubierto) lo que quede de min_j < 0 cuesta overdraft_rate/12 · (−min_j)

Las cuotas y los intereses *que ya existen* están dentro de `out_j` (vienen de la historia de
cargos); solo se añaden explícitamente los flujos del producto nuevo.

Dos convenios que conviene tener presentes, porque son decisiones y no descuidos:

1. `cost` es el coste financiero *reportado* (lo que compara productos). No todo coste sale de la
   caja otra vez: el interés del préstamo ya va dentro de la cuota y el ahorro de la refinanciación
   ya va dentro de `cash`, así que esos importes se reportan en `cost` pero no se vuelven a restar
   del saldo. Comisiones, fees de apertura e intereses de póliza sí salen de la caja.
2. El coste del descubierto se contabiliza en `cost` pero **no** se resta de `eom_j` (así la
   recursión no se realimenta y el saldo sigue siendo el de la operativa). El interés de la póliza
   del mes j se liquida a la apertura del mes j+1, porque se calcula después de conocer `min_j`.

`simulate`, `advance`, `Action`, `History`, `SimConfig`, `Paths` y `FlowPool` son el seam que lee
`xray/policies.py` (MPC y evaluación en bucle cerrado): los nombres y los campos no se tocan sin
avisar.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score

BACKTEST_PATHS = 200
"""Caminos por fila dentro de `backtest`: 200 basta para ordenar empresas y deja el backtest en
segundos; `cfg.n_paths` (500) se reserva para una empresa concreta en pantalla."""

LOAN_PRODUCT_TYPES = ("loan", "leasing", "mortgage")
DEBT_SERVICE_CATEGORIES = ("debt_repayment", "interest_charge")
CANCELLED_INVOICE_STATUSES = ("cancel", "cancelled")
ACTION_KINDS = ("none", "line_draw", "line_cover", "line_open", "factoring", "loan", "refinance")


# --- configuración y acciones ----------------------------------------------------------------


@dataclass(frozen=True)
class SimConfig:
    """Parámetros del simulador y precios de los productos (docs/tech_stack.md §5.1)."""

    n_paths: int = 500
    horizon: int = 6
    history_months: int = 12
    min_history: int = 6
    line_rate: float = 0.0375
    line_undrawn_fee_m: float = 0.001
    line_opening_fee: float = 0.005
    loan_rates: tuple = ((250_000, 0.0356), (1_000_000, 0.0359), (float("inf"), 0.0379))
    loan_term_months: int = 36
    factoring_advance: float = 0.85
    factoring_commission: float = 0.005
    factoring_rate: float = 0.06
    factoring_months: int = 2  # las facturas vendidas se habrían cobrado 2 meses después
    refinance_closing_cost: float = 0.0075
    overdraft_rate: float = 0.18
    dscr_floor: float = 1.2
    seed: int = 0


@dataclass(frozen=True)
class Action:
    """Qué hace la empresa este mes. `amount` va en € salvo en factoring, que es fracción."""

    kind: str  # cualquiera de `ACTION_KINDS`
    amount: float = 0.0
    rate: float | None = None  # tipo anual nuevo (refinance)


NONE = Action("none")


@dataclass
class History:
    """Estado de la empresa al cierre del mes `month`: lo único que necesita `simulate`."""

    company_id: str
    month: str
    eom: float  # saldo a fin de mes (cuentas corrientes)
    inflows: np.ndarray  # entradas totales de los últimos K meses (outflows + Δeom, ≥ 0)
    outflows: np.ndarray  # cargos totales de los últimos K meses
    dips: np.ndarray  # eom − min_balance de los últimos K meses (≥ 0)
    operating_share: float  # mediana de operating_inflows / inflows sobre la historia, en [0, 1]
    debt_service_m: float  # servicio de deuda mensual existente (debt_service_6m_eur / 6)
    line_limit: float = 0.0
    line_drawn: float = 0.0
    receivables: float = 0.0  # cartera elegible a t (emitidas vivas, ≤ 6 meses)
    loan_outstanding: float = 0.0
    loan_installment: float = 0.0
    loan_rate: float | None = None
    loan_remaining: int = 0


@dataclass
class Paths:
    """Resultado de `simulate`: todas las matrices son `(n_paths, horizon)`.

    `cost` es el coste financiero de la acción en € por mes (negativo = ahorro). `draws` guarda el
    triplete sorteado de cada mes para que `advance` extienda la historia exactamente, y
    `line_draws` lo dispuesto en la póliza cada mes (lo que `advance` suma a `line_drawn`).
    """

    eom: np.ndarray
    min_balance: np.ndarray
    cost: np.ndarray
    debt_service: np.ndarray
    op_inflows: np.ndarray
    draws: np.ndarray | None = None  # (n_paths, horizon, 3) → (in, out, dip)
    line_draws: np.ndarray | None = None  # (n_paths, horizon)

    def breach_prob(self) -> float:
        """Probabilidad de que el saldo mínimo baje de 0 en algún mes del horizonte."""
        return float((self.min_balance < 0).any(axis=1).mean())

    def expected_cost(self) -> float:
        """Coste financiero esperado del horizonte completo, en €."""
        return float(self.cost.sum(axis=1).mean())

    def dscr_fail_prob(self, floor: float) -> float:
        """Probabilidad de que entradas operativas / servicio de deuda quede bajo `floor`."""
        service = self.debt_service.sum(axis=1)
        alive = service > 0
        if not alive.any():
            return 0.0
        ratio = np.full(len(service), np.inf)
        ratio[alive] = self.op_inflows.sum(axis=1)[alive] / service[alive]
        return float((ratio < floor).mean())

    def eom_quantiles(self, q=(0.1, 0.5, 0.9)) -> np.ndarray:
        """Cuantiles del saldo a fin de mes por horizonte: `(len(q), horizon)`."""
        return np.quantile(self.eom, list(q), axis=0)


class FlowPool:
    """Pool de tripletes normalizados `(in/med_out, out/med_out, dip/med_out)` de muchas empresas.

    Es el shrinkage de las historias cortas: una empresa con 3 meses no tiene con qué sortear 6
    meses de futuro, así que parte de los sorteos vienen del pool y se reescalan por su mediana de
    cargos.
    """

    __slots__ = ("triplets",)

    def __init__(self, triplets: np.ndarray):
        t = np.asarray(triplets, dtype=float)
        if t.ndim != 2 or t.shape[1] != 3:
            raise ValueError(f"el pool necesita un array (n, 3), llegó {t.shape}")
        t = t[np.isfinite(t).all(axis=1)]
        if not len(t):
            raise ValueError("el pool se quedó sin tripletes finitos")
        self.triplets = t

    @classmethod
    def from_triplets(cls, triplets: np.ndarray) -> FlowPool:
        """Constructor directo desde tripletes ya normalizados (tests y notebooks)."""
        return cls(triplets)

    @classmethod
    def fit(
        cls, features: pd.DataFrame, min_months: int = 12, clip: float | None = 20.0
    ) -> FlowPool:
        """Construye el pool con las empresas de `features` que tienen >= `min_months` meses.

        `clip` winsoriza los tripletes normalizados: sin él la cola es absurda (p99 = 163 veces la
        mediana de cargos, máximo 595 000 veces) porque hay empresas con la mediana de cargos casi
        a cero y un mes enorme, y esos sorteos se llevan por delante el coste en euros de una
        empresa con historia corta. Medido sobre el backtest del 19 sep, recortar a 20 no cuesta
        nada: AUC 0,7948 / 0,6942 con recorte frente a 0,7944 / 0,6935 sin él, y la cobertura de la
        banda se mueve dos milésimas. `clip=None` deja el pool crudo.
        """
        f = _monthly_flows(features)
        rows = []
        for _, g in f.groupby("company_id", sort=False):
            g = g.iloc[1:]  # el primer mes no tiene Δeom → no hay entradas
            if len(g) < min_months:
                continue
            med_out = float(np.median(g["outflow"].to_numpy()))
            if med_out <= 0:
                continue
            rows.append(g[["inflow", "outflow", "dip"]].to_numpy() / med_out)
        if not rows:
            raise ValueError(f"ninguna empresa llega a {min_months} meses: no hay pool que ajustar")
        triplets = np.vstack(rows)
        return cls(triplets if clip is None else np.clip(triplets, 0.0, float(clip)))

    def sample(self, rng, n: int, med_out: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """`n` tripletes del pool reescalados por la mediana de cargos de la empresa."""
        if n <= 0:
            empty = np.zeros(0)
            return empty, empty.copy(), empty.copy()
        idx = rng.integers(0, len(self.triplets), size=n)
        t = self.triplets[idx] * float(med_out)
        return t[:, 0], t[:, 1], t[:, 2]


# --- mecánica de los productos -----------------------------------------------------------------


def _annuity(principal: float, annual_rate: float, months: int) -> float:
    """Cuota constante (sistema francés) de `principal` a `annual_rate` durante `months` meses."""
    if months < 1:
        raise ValueError("una anualidad necesita al menos un periodo")
    i = annual_rate / 12.0
    if i <= 0:
        return principal / months
    return principal * i / (1 - (1 + i) ** -months)


def _rate_for(amount: float, buckets) -> float:
    """Tipo del tramo al que cae `amount` en la curva `((tope, tipo), ...)`."""
    for upper, rate in buckets:
        if amount <= upper:
            return float(rate)
    return float(buckets[-1][1])


@dataclass
class _Plan:
    """Flujos del producto que se conocen antes de simular: todo `(horizon,)` salvo el estado."""

    cash: np.ndarray  # € que entran (+) o salen (−) por el producto
    cost_cash: np.ndarray  # parte del coste que además sale de la caja ese mes
    cost: np.ndarray  # coste financiero reportado
    inst: np.ndarray  # cuotas nuevas (salen de la caja)
    ds_delta: np.ndarray  # cambio del servicio de deuda del mes
    cover_capacity: float = 0.0  # > 0 si el producto cubre descubiertos mes a mes
    undrawn_limit: float | None = None  # base de la comisión de disponibilidad (line_open)
    line_amount: float = 0.0  # dispuesto en el mes 1 por line_draw
    ds_steady: float = 0.0  # cambio permanente del servicio de deuda (lo usa `advance`)
    new_line_limit: float | None = None
    factoring_fraction: float = 0.0
    loan_state: tuple | None = None  # (outstanding, installment, rate, remaining)


def _plan(hist: History, action: Action, cfg: SimConfig, h: int) -> _Plan:
    """Traduce la acción a flujos mensuales. Lanza `ValueError` si la empresa no es elegible.

    La elegibilidad es cosa de quien llama (`xray/policies.py` filtra antes de proponer); aquí se
    comprueba para que un producto imposible no se cuele como recomendación barata.
    """
    z = np.zeros(h)
    plan = _Plan(cash=z.copy(), cost_cash=z.copy(), cost=z.copy(), inst=z.copy(), ds_delta=z.copy())
    kind = action.kind
    if kind not in ACTION_KINDS:
        raise ValueError(f"acción desconocida: {kind!r}; válidas: {ACTION_KINDS}")

    if kind == "none":
        return plan

    if kind == "line_draw":
        amount = float(action.amount)
        room = float(hist.line_limit) - float(hist.line_drawn)
        if amount <= 0:
            raise ValueError("line_draw necesita un importe > 0")
        if amount > room + 1e-9:
            raise ValueError(f"line_draw de {amount:,.0f} € sobre un disponible de {room:,.0f} €")
        plan.cash[0] += amount
        interest = cfg.line_rate / 12.0 * amount
        plan.cost += interest
        plan.cost_cash += interest
        plan.line_amount = amount
        return plan

    if kind == "line_cover":
        room = float(hist.line_limit) - float(hist.line_drawn)
        if room <= 0:
            raise ValueError("line_cover necesita línea disponible; esta empresa no tiene")
        plan.cover_capacity = room
        return plan

    if kind == "line_open":
        limit = float(action.amount)
        if limit <= 0:
            raise ValueError("line_open necesita un límite > 0")
        fee = cfg.line_opening_fee * limit
        plan.cost[0] += fee
        plan.cost_cash[0] += fee
        plan.cover_capacity = limit
        plan.undrawn_limit = limit
        plan.new_line_limit = limit
        return plan

    if kind == "factoring":
        fraction = float(action.amount)
        if not 0 < fraction <= 1:
            raise ValueError("factoring necesita una fracción de cartera en (0, 1]")
        sold = fraction * float(hist.receivables)
        if sold <= 0:
            raise ValueError("factoring necesita cartera emitida viva; esta empresa no tiene")
        advance_eur = cfg.factoring_advance * sold
        cost = (
            cfg.factoring_commission * sold
            + cfg.factoring_rate * advance_eur * (30 * cfg.factoring_months) / 360
        )
        plan.cash[0] += advance_eur
        plan.cost[0] += cost
        plan.cost_cash[0] += cost
        settle = cfg.factoring_months  # índice 0-based del mes 1 + factoring_months
        if settle < h:  # si cae fuera del horizonte, la pata larga no se ve
            plan.cash[settle] += (1 - cfg.factoring_advance) * sold - sold
        plan.factoring_fraction = fraction
        return plan

    if kind == "loan":
        amount = float(action.amount)
        if amount <= 0:
            raise ValueError("loan necesita un importe > 0")
        rate = _rate_for(amount, cfg.loan_rates)
        i = rate / 12.0
        term = int(cfg.loan_term_months)
        installment = _annuity(amount, rate, term)
        plan.cash[0] += amount
        outstanding = amount
        for j in range(1, min(h, term + 1)):  # el mes 1 es de carencia: se dispone, no se paga
            interest = i * outstanding
            plan.cost[j] += interest  # el principal no es coste; el interés ya va en la cuota
            plan.inst[j] += installment
            plan.ds_delta[j] += installment
            outstanding = max(0.0, outstanding - (installment - interest))
        plan.ds_steady = installment
        plan.loan_state = (amount, installment, rate, term)
        return plan

    # refinance
    if action.rate is None:
        raise ValueError("refinance necesita el tipo nuevo")
    new_rate = float(action.rate)
    outstanding = float(hist.loan_outstanding)
    old_installment = float(hist.loan_installment)
    if outstanding <= 0:
        raise ValueError("refinance necesita deuda viva")
    if old_installment <= 0:
        raise ValueError("refinance necesita una cuota actual conocida")
    if hist.loan_rate is None or not np.isfinite(float(hist.loan_rate)):
        raise ValueError("refinance necesita el tipo actual; no consta en debt_schedule_config")
    if new_rate >= float(hist.loan_rate):
        raise ValueError(
            f"refinanciar al {new_rate:.2%} no mejora el {float(hist.loan_rate):.2%} actual"
        )
    remaining = int(hist.loan_remaining)
    if remaining < 1:
        raise ValueError("refinance necesita plazo pendiente >= 1 mes")
    closing = cfg.refinance_closing_cost * outstanding
    plan.cost[0] += closing
    plan.cost_cash[0] += closing
    new_installment = _annuity(outstanding, new_rate, remaining)
    saving = old_installment - new_installment
    for j in range(1, min(h, remaining + 1)):
        plan.cost[j] -= saving  # ahorro: coste negativo
        plan.cash[j] += saving  # el ahorro ya es el flujo de caja; no se resta cost otra vez
        plan.ds_delta[j] -= saving
    plan.ds_steady = -saving
    plan.loan_state = (outstanding, new_installment, new_rate, remaining)
    return plan


def _draw_triplets(hist: History, cfg: SimConfig, rng, n: int, h: int, pool: FlowPool | None):
    """Sortea `(n, h, 3)` tripletes `(in, out, dip)` i.i.d., con shrinkage al pool si toca."""
    inflows = np.nan_to_num(np.asarray(hist.inflows, dtype=float))
    outflows = np.nan_to_num(np.asarray(hist.outflows, dtype=float))
    dips = np.clip(np.nan_to_num(np.asarray(hist.dips, dtype=float)), 0.0, None)
    length = min(len(inflows), len(outflows), len(dips))
    length = min(length, cfg.history_months)
    draws = np.zeros((n, h, 3))
    med_out = 0.0
    if length:
        inflows, outflows, dips = inflows[-length:], outflows[-length:], dips[-length:]
        med_out = float(np.median(outflows))
        idx = rng.integers(0, length, size=(n, h))
        draws[:, :, 0], draws[:, :, 1], draws[:, :, 2] = inflows[idx], outflows[idx], dips[idx]
    if pool is not None and length < cfg.min_history:
        # Historia corta: cada sorteo viene del pool con probabilidad 1 − len/min_history.
        share = 1.0 - length / cfg.min_history
        mask = rng.random((n, h)) < share
        count = int(mask.sum())
        if count:
            sampled = pool.sample(rng, count, med_out)
            for axis, values in enumerate(sampled):
                plane = draws[:, :, axis]
                plane[mask] = values
                draws[:, :, axis] = plane
    return draws


def simulate(
    hist: History,
    action: Action = NONE,
    cfg: SimConfig | None = None,
    rng=None,
    pool: FlowPool | None = None,
    horizon: int | None = None,
) -> Paths:
    """Simula `cfg.n_paths` trayectorias de caja de `horizon` meses bajo `action`.

    `horizon` manda sobre `cfg.horizon` cuando se pasa; `rng=None` crea uno con `cfg.seed`, y como
    el consumo de aleatoriedad no depende de la acción, **dos acciones distintas sobre la misma
    `History` ven exactamente los mismos sorteos**: la comparación entre productos es pareada
    (números aleatorios comunes) y la diferencia de coste o de riesgo es señal, no ruido. Pasar un
    `rng` compartido entre acciones rompe ese emparejamiento; hazlo solo para barrer empresas
    distintas, como hace `backtest`. `pool` solo interviene si la historia es corta.
    """
    cfg = cfg or SimConfig()
    h = int(cfg.horizon if horizon is None else horizon)
    if h < 1:
        raise ValueError("el horizonte tiene que ser >= 1 mes")
    n = int(cfg.n_paths)
    if n < 1:
        raise ValueError("n_paths tiene que ser >= 1")
    if rng is None:
        rng = np.random.default_rng(cfg.seed)

    plan = _plan(hist, action, cfg, h)
    draws = _draw_triplets(hist, cfg, rng, n, h, pool)
    inflow, outflow, dip = draws[:, :, 0], draws[:, :, 1], draws[:, :, 2]

    eom = np.empty((n, h))
    min_balance = np.empty((n, h))
    cost = np.tile(plan.cost, (n, 1))
    line_draws = np.zeros((n, h))
    line_draws[:, 0] = plan.line_amount
    balance = np.full(n, float(hist.eom))
    drawn = np.zeros(n)
    month_rate = cfg.line_rate / 12.0
    overdraft_rate = cfg.overdraft_rate / 12.0

    for j in range(h):
        value = (
            balance + inflow[:, j] - outflow[:, j] + plan.cash[j] - plan.cost_cash[j] - plan.inst[j]
        )
        low = value - dip[:, j]
        carry = 0.0
        if plan.cover_capacity > 0:
            take = np.clip(np.minimum(-low, plan.cover_capacity - drawn), 0.0, None)
            value = value + take
            low = low + take
            drawn = drawn + take
            line_draws[:, j] += take
            carry = month_rate * drawn
            if plan.undrawn_limit is not None:
                undrawn = np.clip(plan.undrawn_limit - drawn, 0.0, None)
                carry = carry + cfg.line_undrawn_fee_m * undrawn
            cost[:, j] += carry
        cost[:, j] += overdraft_rate * np.clip(-low, 0.0, None)  # el descubierto no realimenta eom
        eom[:, j] = value
        min_balance[:, j] = low
        balance = value - carry  # el interés del mes j se liquida al abrir el mes j+1

    debt_service = np.clip(np.tile(hist.debt_service_m + plan.ds_delta, (n, 1)), 0.0, None)
    return Paths(
        eom=eom,
        min_balance=min_balance,
        cost=cost,
        debt_service=debt_service,
        op_inflows=float(hist.operating_share) * inflow,
        draws=draws,
        line_draws=line_draws,
    )


def advance(
    hist: History, paths: Paths, action: Action = NONE, k: int = 0, cfg: SimConfig | None = None
) -> History:
    """La `History` del mes siguiente a lo largo del camino `k` de `paths`.

    Mueve el saldo, alarga la historia con el triplete sorteado (y la recorta a `history_months`) y
    actualiza el estado del producto: dispuesto de la línea, límite nuevo, cartera vendida, préstamo
    o refinanciación. Es lo que necesita el MPC para simular varios meses seguidos.
    """
    cfg = cfg or SimConfig()
    if paths.draws is None:
        raise ValueError("advance necesita `paths.draws`: simula con esta misma versión")
    plan = _plan(hist, action, cfg, 1)
    triplet = paths.draws[k, 0]
    keep = cfg.history_months
    drawn = float(paths.line_draws[k, 0]) if paths.line_draws is not None else plan.line_amount
    limit = plan.new_line_limit if plan.new_line_limit is not None else hist.line_limit

    nxt = History(
        company_id=hist.company_id,
        month=str(pd.Period(hist.month, freq="M") + 1),
        eom=float(paths.eom[k, 0]),
        inflows=np.append(hist.inflows, triplet[0])[-keep:],
        outflows=np.append(hist.outflows, triplet[1])[-keep:],
        dips=np.append(hist.dips, triplet[2])[-keep:],
        operating_share=hist.operating_share,
        debt_service_m=max(0.0, float(hist.debt_service_m) + plan.ds_steady),
        line_limit=float(limit),
        line_drawn=float(hist.line_drawn) + drawn,
        receivables=float(hist.receivables) * (1.0 - plan.factoring_fraction),
        loan_outstanding=hist.loan_outstanding,
        loan_installment=hist.loan_installment,
        loan_rate=hist.loan_rate,
        loan_remaining=hist.loan_remaining,
    )
    if plan.loan_state is not None:
        outstanding, installment, rate, remaining = plan.loan_state
        nxt.loan_outstanding = float(outstanding)
        nxt.loan_installment = float(installment)
        nxt.loan_rate = float(rate)
        nxt.loan_remaining = int(remaining)
    return nxt


# --- de la tabla de features (y de los CSV) a las historias -------------------------------------


def _monthly_flows(features: pd.DataFrame) -> pd.DataFrame:
    """Entradas, cargos y bache intramensual por empresa y mes, ordenados y sin NaN.

    Las entradas totales no son columna del contrato: se derivan de `outflows + Δeom` y se recortan
    en 0 (el primer mes de cada empresa no tiene Δeom y queda con entradas 0; quien lo use, lo
    salta).
    """
    cols = ["company_id", "month", "operating_inflows_eur", "outflows_eur", "eom_balance_eur",
            "min_balance_eur"]
    f = features[[c for c in cols if c in features.columns]].copy()
    f["month"] = f["month"].astype(str)
    f = f.sort_values(["company_id", "month"], kind="stable").reset_index(drop=True)
    prev_eom = f.groupby("company_id", sort=False)["eom_balance_eur"].shift(1)
    f["inflow"] = (f["outflows_eur"] + (f["eom_balance_eur"] - prev_eom)).clip(lower=0).fillna(0.0)
    f["outflow"] = f["outflows_eur"].fillna(0.0).clip(lower=0)
    f["dip"] = (f["eom_balance_eur"] - f["min_balance_eur"]).clip(lower=0).fillna(0.0)
    f["op_ratio"] = (f["operating_inflows_eur"] / f["inflow"].where(f["inflow"] > 0)).clip(0, 1)
    return f


EXTRA_COLUMNS = ("line_limit", "line_drawn", "receivables_eur", "loan_outstanding",
                 "loan_installment", "loan_rate", "loan_remaining")


def histories(
    features: pd.DataFrame, extras: pd.DataFrame | None = None, cfg: SimConfig | None = None
) -> dict[tuple[str, str], History]:
    """Una `History` por `(company_id, month)` de la tabla de features, salvo el primer mes.

    El primer mes de cada empresa se salta porque sin `eom_{t−1}` no hay entradas totales. `extras`
    (el resultado de `company_extras`) se cruza por `(company_id, month)`; lo que falte deja la
    empresa sin línea, sin cartera y sin préstamo, que es lo mismo que no ser elegible.
    """
    cfg = cfg or SimConfig()
    flows = _monthly_flows(features)
    service = features[["company_id", "month"]].copy()
    service["month"] = service["month"].astype(str)
    if "debt_service_6m_eur" in features.columns:
        service["debt_service_m"] = (features["debt_service_6m_eur"] / 6).fillna(0.0).to_numpy()
    else:
        service["debt_service_m"] = 0.0
    frame = flows.merge(service, on=["company_id", "month"], how="left")
    for col in EXTRA_COLUMNS:
        frame[col] = np.nan
    if extras is not None and len(extras):
        ex = extras.copy()
        ex["month"] = ex["month"].astype(str)
        ex = ex[["company_id", "month", *[c for c in EXTRA_COLUMNS if c in ex.columns]]]
        frame = frame.drop(columns=list(EXTRA_COLUMNS))
        frame = frame.merge(ex, on=["company_id", "month"], how="left")
        for col in EXTRA_COLUMNS:
            if col not in frame.columns:
                frame[col] = np.nan

    inflow = frame["inflow"].to_numpy(float)
    outflow = frame["outflow"].to_numpy(float)
    dip = frame["dip"].to_numpy(float)
    op_ratio = frame["op_ratio"].to_numpy(float)
    eom = frame["eom_balance_eur"].to_numpy(float)
    debt_service = frame["debt_service_m"].to_numpy(float)
    months = frame["month"].to_numpy()
    extra = {col: frame[col].to_numpy(float) for col in EXTRA_COLUMNS}
    keep = cfg.history_months

    out: dict[tuple[str, str], History] = {}
    for company, positions in frame.groupby("company_id", sort=False).indices.items():
        pos = np.asarray(positions)
        for t in range(1, len(pos)):  # el primer mes no tiene Δeom
            window = pos[max(1, t - keep + 1) : t + 1]
            ratios = op_ratio[window]
            ratios = ratios[np.isfinite(ratios)]
            row = pos[t]
            rate = extra["loan_rate"][row]
            out[(company, months[row])] = History(
                company_id=company,
                month=months[row],
                eom=float(eom[row]),
                inflows=inflow[window],
                outflows=outflow[window],
                dips=dip[window],
                operating_share=float(np.median(ratios)) if len(ratios) else 1.0,
                debt_service_m=float(np.nan_to_num(debt_service[row])),
                line_limit=float(np.nan_to_num(extra["line_limit"][row])),
                line_drawn=float(np.nan_to_num(extra["line_drawn"][row])),
                receivables=float(np.nan_to_num(extra["receivables_eur"][row])),
                loan_outstanding=float(np.nan_to_num(extra["loan_outstanding"][row])),
                loan_installment=float(np.nan_to_num(extra["loan_installment"][row])),
                loan_rate=None if not np.isfinite(rate) else float(rate),
                loan_remaining=int(np.nan_to_num(extra["loan_remaining"][row], nan=0.0)),
            )
    return out


def _company_index(*frames) -> list[str]:
    """Universo de empresas: las que tienen algún producto bancario o de deuda."""
    ids: set[str] = set()
    for frame in frames:
        if frame is not None and "company_id" in getattr(frame, "columns", []):
            ids.update(frame["company_id"].dropna().unique().tolist())
    return sorted(ids)


def _receivables_matrix(invoices: pd.DataFrame, companies: list[str], grid: pd.PeriodIndex,
                        window: int = 6) -> np.ndarray:
    """Cartera emitida viva a fin de cada mes de `grid`, por empresa: `(n_companies, len(grid))`.

    Una factura emitida cuenta desde su mes de emisión hasta el mes anterior al cobro, y como mucho
    `window` meses (más allá ya no es cartera financiable). En `overdue` la `payment_date` no es una
    fecha de pago real (AGENTS.md), así que solo se considera cobrada la que está `paid`.
    """
    size = (len(companies), len(grid))
    if invoices is None or not len(invoices):
        return np.zeros(size)
    inv = invoices
    mask = (inv["amount"] > 0) & inv["issuance_date"].notna()
    if "document_type" in inv.columns:
        mask &= inv["document_type"] == "invoice"
    if "status" in inv.columns:
        mask &= ~inv["status"].isin(CANCELLED_INVOICE_STATUSES)
    if "direction" in inv.columns:
        mask &= inv["direction"] == "issued"
    inv = inv[mask]
    index = {c: i for i, c in enumerate(companies)}
    rows = inv["company_id"].map(index)
    inv = inv[rows.notna()]
    if not len(inv):
        return np.zeros(size)
    rows = rows.dropna().to_numpy(int)
    origin = grid[0].ordinal
    start = pd.PeriodIndex(inv["issuance_date"].dt.to_period("M")).asi8 - origin
    end = start + window - 1
    if "payment_date" in inv.columns and "status" in inv.columns:
        paid = inv["status"].eq("paid") & inv["payment_date"].notna()
        paid_month = pd.PeriodIndex(inv["payment_date"].dt.to_period("M")).asi8 - origin
        end = np.where(paid.to_numpy(), np.minimum(end, paid_month - 1), end)
    amount = inv["amount"].to_numpy(float)

    alive = (end >= 0) & (start < len(grid)) & (end >= start)
    rows, amount = rows[alive], amount[alive]
    start = np.clip(start[alive], 0, len(grid) - 1)
    end = np.clip(end[alive], 0, len(grid) - 1)
    diff = np.zeros((len(companies), len(grid) + 1))
    np.add.at(diff, (rows, start), amount)
    np.add.at(diff, (rows, end + 1), -amount)
    # El clip se come el residuo de coma flotante del acumulado (del orden de 1e-9 €).
    return np.clip(diff[:, :-1].cumsum(axis=1), 0.0, None)


def _remaining_periods(config: pd.DataFrame) -> np.ndarray:
    """Plazo pendiente de cada contrato invirtiendo la anualidad; 36 meses si no sale."""
    i = config["annual_interest_rate_or_spread"].to_numpy(float) / 12.0
    granted = config["granted_balance"].to_numpy(float)
    outstanding = config["outstanding_balance"].to_numpy(float)
    total = config["total_periods"].to_numpy(float)
    with np.errstate(divide="ignore", invalid="ignore"):
        pay = granted * i / (1 - (1 + i) ** -total)
        ratio = 1 - outstanding * i / pay
        periods = -np.log(ratio) / np.log1p(i)
    bad = ~np.isfinite(periods) | (periods < 1)
    return np.where(bad, 36.0, np.round(periods))


def company_extras(
    transactions: pd.DataFrame,
    debt_products: pd.DataFrame,
    banking_products: pd.DataFrame,
    debt_schedule_config: pd.DataFrame,
    invoices: pd.DataFrame,
    months: list[str],
    *,
    features: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Estado de productos por empresa y mes: línea, cartera y préstamo.

    Es lo que la tabla de features no lleva y `simulate` necesita para saber qué productos son
    elegibles. Columnas: `company_id, month, line_limit, line_drawn, receivables_eur,
    loan_outstanding, loan_installment, loan_rate, loan_remaining`.

    Supuestos que conviene conocer (no salen del dataset tal cual):
    - `line_drawn`: si se pasa `features`, `credit_line_usage × line_limit` de ese mes (con el
      último uso conocido arrastrado hacia delante); si no, el uso de la foto final
      (`outstanding/granted` de las pólizas) y, a falta de todo, **0,5 × límite**.
    - `loan_installment`: mediana del servicio de deuda de los meses de los últimos 6 en los que
      hubo pago (0 si no hubo ninguno); los meses sin pago no cuentan para que un pagador
      trimestral no salga con cuota 0.
    - `loan_rate` y `loan_remaining` salen solo de `debt_schedule_config` (87 contratos): sin
      contrato no hay tipo y la refinanciación no es elegible, que es la verdad del dataset.
    """
    months = [str(m) for m in months]
    grid = pd.period_range(min(months), max(months), freq="M")
    companies = _company_index(banking_products, debt_products)
    if not companies:
        return pd.DataFrame(columns=["company_id", "month", *EXTRA_COLUMNS])
    wanted = [grid.get_loc(pd.Period(m, freq="M")) for m in months]

    # --- línea de crédito: límite y dispuesto ---------------------------------------------------
    lines = debt_products[debt_products["type"] == "lineofcredit"]
    limit = lines.assign(v=lines["granted"].abs()).groupby("company_id")["v"].sum()
    drawn_snapshot = lines.assign(v=lines["outstanding"].abs()).groupby("company_id")["v"].sum()
    limit = limit.reindex(companies).fillna(0.0)
    usage = (drawn_snapshot.reindex(companies) / limit.where(limit > 0)).clip(0, 1)

    # --- préstamos: saldo vivo, cuota, tipo y plazo ---------------------------------------------
    loans = debt_products[debt_products["type"].isin(LOAN_PRODUCT_TYPES)]
    outstanding = loans.assign(v=loans["outstanding"].abs()).groupby("company_id")["v"].sum()
    outstanding = outstanding.reindex(companies).fillna(0.0)

    config = debt_schedule_config
    rate = pd.Series(np.nan, index=companies, dtype=float)
    remaining = pd.Series(np.nan, index=companies, dtype=float)
    if config is not None and len(config):
        cfg_rows = config.assign(
            w=config["outstanding_balance"].abs(), k=_remaining_periods(config)
        )
        cfg_rows["rw"] = cfg_rows["annual_interest_rate_or_spread"] * cfg_rows["w"]
        cfg_rows["kw"] = cfg_rows["k"] * cfg_rows["w"]
        agg = cfg_rows.groupby("company_id")[["w", "rw", "kw"]].sum()
        weight = agg["w"].where(agg["w"] > 0)
        rate = (agg["rw"] / weight).reindex(companies)
        remaining = (agg["kw"] / weight).round().clip(lower=1).reindex(companies)

    # --- servicio de deuda mensual: mediana de los meses con pago de los últimos 6 --------------
    service = transactions[
        transactions["category"].isin(DEBT_SERVICE_CATEGORIES) & (transactions["amount"] < 0)
    ]
    has_month = "month" in service.columns
    month_col = service["month"] if has_month else service["date"].dt.to_period("M")
    paid = (
        service.assign(v=-service["amount"], m=month_col)
        .groupby(["company_id", "m"])["v"].sum()
        .unstack()
        .reindex(index=companies, columns=grid)
    )
    installment = paid.T.rolling(6, min_periods=1).median().T.fillna(0.0).to_numpy()

    receivables = _receivables_matrix(invoices, companies, grid)

    # --- a formato largo ------------------------------------------------------------------------
    n_months = len(months)
    out = pd.DataFrame({
        "company_id": np.repeat(companies, n_months),
        "month": np.tile(months, len(companies)),
        "line_limit": np.repeat(limit.to_numpy(float), n_months),
        "receivables_eur": receivables[:, wanted].ravel(),
        "loan_outstanding": np.repeat(outstanding.to_numpy(float), n_months),
        "loan_installment": installment[:, wanted].ravel(),
        "loan_rate": np.repeat(rate.to_numpy(float), n_months),
        "loan_remaining": np.repeat(remaining.fillna(36).to_numpy(float), n_months),
    })
    monthly_usage = np.repeat(usage.to_numpy(float), n_months)
    if features is not None and "credit_line_usage" in features.columns:
        known = features[["company_id", "month", "credit_line_usage"]].copy()
        known["month"] = known["month"].astype(str)
        known = known.sort_values(["company_id", "month"], kind="stable")
        known["credit_line_usage"] = known.groupby("company_id")["credit_line_usage"].ffill()
        merged = out[["company_id", "month"]].merge(known, on=["company_id", "month"], how="left")
        monthly_usage = np.where(
            merged["credit_line_usage"].notna(), merged["credit_line_usage"], monthly_usage
        )
    out["line_drawn"] = np.where(np.isnan(monthly_usage), 0.5, monthly_usage) * out["line_limit"]
    return out[["company_id", "month", *EXTRA_COLUMNS]]


# --- etiqueta realizada, calibración y backtest -------------------------------------------------


def _month_matrix(features: pd.DataFrame, column: str) -> pd.DataFrame:
    """Matriz empresa × mes de `column`, con todos los meses del rango (los huecos son NaN)."""
    f = features[["company_id", "month", column]].copy()
    f["month"] = f["month"].astype(str)
    table = f.pivot_table(index="company_id", columns="month", values=column, aggfunc="last")
    grid = pd.period_range(min(table.columns), max(table.columns), freq="M").astype(str)
    return table.reindex(columns=grid)


def _to_long(table: pd.DataFrame, values: np.ndarray, name: str) -> pd.DataFrame:
    companies = table.index.to_numpy()
    months = table.columns.to_numpy()
    return pd.DataFrame({
        "company_id": np.repeat(companies, len(months)),
        "month": np.tile(months, len(companies)),
        name: values.ravel(),
    })


def realized_breach(features: pd.DataFrame, h: int = 6) -> pd.DataFrame:
    """`(company_id, month, breach{h})`: 1 si el saldo mínimo se va bajo 0 en t+1..t+h.

    NaN cuando faltan meses futuros y no se ha visto ningún descubierto en los que hay: una
    ventana incompleta sin evento no es un 0, pero un evento ya observado es un 1 aunque la ventana
    se corte después.
    """
    table = _month_matrix(features, "min_balance_eur")
    values = table.to_numpy(float)
    negative = np.where(np.isnan(values), np.nan, (values < 0).astype(float))
    n_companies, n_months = values.shape
    seen = np.zeros((n_companies, n_months), dtype=bool)
    known = np.zeros((n_companies, n_months), dtype=int)
    for k in range(1, h + 1):
        shifted = np.full((n_companies, n_months), np.nan)
        if n_months > k:
            shifted[:, : n_months - k] = negative[:, k:]
        observed = ~np.isnan(shifted)
        known += observed
        seen |= observed & (shifted > 0)
    result = np.where(seen, 1.0, np.where(known == h, 0.0, np.nan))
    long = _to_long(table, result, f"breach{h}")
    keys = features[["company_id", "month"]].copy()
    keys["month"] = keys["month"].astype(str)
    return keys.merge(long, on=["company_id", "month"], how="left")


def _future(features: pd.DataFrame, column: str, h: int) -> pd.DataFrame:
    """El valor de `column` en t+h, alineado con `(company_id, month)` de t."""
    table = _month_matrix(features, column)
    values = table.to_numpy(float)
    shifted = np.full(values.shape, np.nan)
    if values.shape[1] > h:
        shifted[:, : values.shape[1] - h] = values[:, h:]
    return _to_long(table, shifted, f"{column}_t{h}")


def calibrate(raw: pd.Series, realized: pd.Series) -> IsotonicRegression:
    """Isotónica creciente de probabilidad cruda a frecuencia observada, acotada en [0, 1]."""
    x = np.asarray(raw, dtype=float)
    y = np.asarray(realized, dtype=float)
    ok = np.isfinite(x) & np.isfinite(y)
    if ok.sum() < 2:
        raise ValueError("la calibración necesita al menos dos observaciones válidas")
    model = IsotonicRegression(y_min=0.0, y_max=1.0, increasing=True, out_of_bounds="clip")
    model.fit(x[ok], y[ok])
    return model


def _auc(y_true, score) -> float:
    """AUC, o NaN si no hay las dos clases (pasa en meses sin ningún evento)."""
    y = np.asarray(y_true, dtype=float)
    s = np.asarray(score, dtype=float)
    ok = np.isfinite(y) & np.isfinite(s)
    if ok.sum() < 2 or len(np.unique(y[ok])) < 2:
        return float("nan")
    return float(roc_auc_score(y[ok], s[ok]))


def _coverage(table: pd.DataFrame, h: int) -> float:
    """Cobertura de la banda 10–90 %: cuántos saldos realizados a t+h caen dentro."""
    low, high, real = table[f"eom_p10_h{h}"], table[f"eom_p90_h{h}"], table[f"eom_real_h{h}"]
    ok = low.notna() & high.notna() & real.notna()
    if not ok.any():
        return float("nan")
    return float(((real >= low) & (real <= high))[ok].mean())


def backtest(
    features: pd.DataFrame,
    extras: pd.DataFrame | None,
    cfg: SimConfig,
    test_months: list[str],
    train_until: str = "2025-08",
    pool: FlowPool | None = None,
) -> tuple[dict, pd.DataFrame]:
    """Corre el simulador sin acción sobre todo el histórico y mide si la probabilidad vale.

    Simula cada `(company_id, month)` de los meses de entrenamiento (`month <= train_until`) y de
    `test_months`, compara `p_breach_raw` con el descubierto realizado a 1 y 6 meses, calibra con
    una isotónica ajustada **solo** en entrenamiento (filas con `min_balance_eur >= 0`, para no
    medir lo que ya está roto) y mide la cobertura de la banda 10–90 % del saldo.

    Usa `BACKTEST_PATHS` (200) caminos por fila en vez de `cfg.n_paths`: es un barrido de ~16 000
    filas y con 200 caminos la ordenación ya es estable.

    Devuelve `(metrics, table)`; `table` lleva una fila por `(company_id, month)` simulada.
    """
    horizons = [h for h in (1, 3, 6) if h <= cfg.horizon]
    run_cfg = replace(cfg, n_paths=BACKTEST_PATHS)
    hist_by_key = histories(features, extras, cfg)
    rng = np.random.default_rng(cfg.seed)

    keys = features[["company_id", "month", "min_balance_eur", "eom_balance_eur"]].copy()
    keys["month"] = keys["month"].astype(str)
    test = {str(m) for m in test_months}
    selected = keys[(keys["month"] <= str(train_until)) | keys["month"].isin(test)]

    rows = []
    for company, month, min_balance, eom in selected.itertuples(index=False, name=None):
        hist = hist_by_key.get((company, month))
        if hist is None:  # primer mes de la empresa: sin Δeom no hay historia que sortear
            continue
        paths = simulate(hist, NONE, run_cfg, rng=rng, pool=pool)
        low, high = paths.eom_quantiles((0.1, 0.9))
        row = {
            "company_id": company,
            "month": month,
            "split": "test" if month in test else "train",
            "p_breach_raw": paths.breach_prob(),
            "expected_cost": paths.expected_cost(),
            "min_balance_eur": min_balance,
            "eom_balance_eur": eom,
            "months_of_history": len(hist.inflows),
        }
        for h in horizons:
            row[f"eom_p10_h{h}"] = low[h - 1]
            row[f"eom_p90_h{h}"] = high[h - 1]
        rows.append(row)

    table = pd.DataFrame(rows)
    if table.empty:
        raise ValueError("no hay ninguna fila simulable: revisa test_months y la tabla de features")
    for h in (1, 6):
        table = table.merge(realized_breach(features, h=h).drop_duplicates(["company_id", "month"]),
                            on=["company_id", "month"], how="left")
    for h in horizons:
        future = _future(features, "eom_balance_eur", h).rename(
            columns={f"eom_balance_eur_t{h}": f"eom_real_h{h}"}
        )
        table = table.merge(future, on=["company_id", "month"], how="left")

    train = table[(table["split"] == "train") & (table["min_balance_eur"] >= 0)]
    train = train[train["breach6"].notna()]
    model = calibrate(train["p_breach_raw"], train["breach6"])
    table["p_breach_cal"] = model.predict(table["p_breach_raw"].to_numpy(float))

    evaluated = table[(table["split"] == "test") & (table["min_balance_eur"] >= 0)]
    metrics = {
        "n_train": len(train),
        "n_test": len(evaluated),
        "breach6_rate_test": float(evaluated["breach6"].mean()),
        "auc_h1": _auc(evaluated["breach1"], evaluated["p_breach_raw"]),
        "auc_h6": _auc(evaluated["breach6"], evaluated["p_breach_raw"]),
        "auc_h6_calibrated": _auc(evaluated["breach6"], evaluated["p_breach_cal"]),
    }
    for h in horizons:
        metrics[f"coverage_p10_p90_h{h}"] = _coverage(evaluated, h)
    metrics["calibration"] = _calibration_table(evaluated)
    return metrics, table


def _calibration_table(evaluated: pd.DataFrame, n_bins: int = 10) -> list[dict]:
    """Deciles de `p_breach_raw` con la frecuencia observada: la tabla que mira el asesor."""
    rows = evaluated.dropna(subset=["breach6", "p_breach_raw"]).copy()
    if len(rows) < n_bins:
        return []
    order = rows["p_breach_raw"].rank(method="first")  # fuerza 10 grupos aunque haya muchos empates
    rows["decile"] = pd.qcut(order, n_bins, labels=False) + 1
    return [
        {
            "decile": int(decile),
            "p_raw": float(group["p_breach_raw"].mean()),
            "p_cal": float(group["p_breach_cal"].mean()),
            "realized": float(group["breach6"].mean()),
            "n": len(group),
        }
        for decile, group in rows.groupby("decile", sort=True)
    ]
