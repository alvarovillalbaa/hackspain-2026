"""Políticas sobre el simulador de caja: líneas base, MPC y bucle cerrado (experimentos B2–B3).

Responde a la segunda pregunta del asesor: *dado el simulador de `xray/projection.py`, ¿qué acción
toca este mes, y cuánto mejor es que la regla de toda la vida?* El motor es MPC con horizonte
móvil: se enumeran las acciones elegibles (`candidate_actions`), se simulan los seis próximos meses
de cada una **con los mismos sorteos** y se queda la que minimiza

    objective = E[coste] + λ · P(rotura) + μ · P(DSCR < suelo)

`evaluate_policy` corre cualquier política en bucle cerrado —decidir, avanzar un mes real, volver a
decidir— y devuelve coste, roturas y acciones por empresa; `perfect_foresight` hace lo mismo viendo
los sorteos futuros y da la cota contra la que se mide el arrepentimiento.

Tres cosas que conviene saber antes de tocar nada:

1. **Sorteos pareados.** `simulate` consume el generador igual para todas las acciones, así que dos
   candidatos con la *misma semilla* ven exactamente los mismos meses. Por eso aquí nunca se
   comparte un generador entre candidatos: se crea uno nuevo por candidato desde la misma semilla
   base (`_base_seed`). Compartirlo convertiría la diferencia entre productos en ruido de sorteo.

2. **El paso del bucle cerrado es de un mes, y eso recorta los productos largos.** `simulate` con
   `horizon=1` solo aplica el plan del mes en curso: el cobro de la pata larga del factoring (mes
   +2) y las cuotas del préstamo nuevo (del mes +2 en adelante) nunca llegan a tocar el saldo, y de
   la acción solo se contabiliza el coste del primer mes. La deuda *previa* sí está dentro de los
   cargos sorteados, y el servicio nuevo sí viaja en `debt_service_m` (y por tanto en el DSCR), pero
   no en la caja. Consecuencia práctica: en `evaluate_policy` un préstamo o un anticipo salen más
   baratos de lo que son, mientras que el MPC sí los paga dentro de su horizonte de 6 meses. Para
   arreglarlo de verdad habría que cobrar `hist.loan_installment` en el paso, y eso es una
   decisión del seam de `projection`, no de aquí.

3. **`shift` es mala especificación, no cambio de régimen.** El mundo del paso sortea de la historia
   escalada (`inflows × inflow_scale`, `dips × dip_scale`) y con los precios desplazados
   (`rate_shock` sobre póliza, factoring y curva de préstamo; el recargo de descubierto no es precio
   de mercado y se deja quieto), pero la historia que se arrastra y que ve la política guarda el
   sorteo **sin escalar**: así el desvío se mantiene constante mes a mes en vez de componerse
   (0,8¹² = 0,07 sería otro experimento). El saldo, en cambio, es el real: la empresa vive el mundo
   desplazado aunque su modelo no lo sepa.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace

import numpy as np
import pandas as pd
from scipy.special import lambertw

from xray.projection import NONE, Action, FlowPool, History, Paths, SimConfig, advance, simulate

Policy = Callable[..., Action]
"""Una política es `policy(hist, cfg, rng) -> Action`; `rng` solo lo usa el MPC."""

REFINANCE_MIN_GAP = 0.005
"""Hueco mínimo de tipo para que la refinanciación entre en la rejilla del MPC (50 pb)."""

ADVISOR_MIN_GAP = 0.01
"""Hueco de tipo de la regla del asesor (100 pb, `docs/experimentos_productos.md` §B2)."""

SHIFT_KEYS = ("inflow_scale", "dip_scale", "rate_shock")

RESULT_COLUMNS = ["company_id", "total_cost", "breach", "n_breach_months", "dscr_fail_months",
                  "actions"]


# --- precios y elegibilidad ---------------------------------------------------------------------


def fair_loan_rate(amount: float, cfg: SimConfig | None = None) -> float:
    """Tipo de mercado del tramo al que cae `amount` en `cfg.loan_rates`."""
    cfg = cfg or SimConfig()
    for upper, rate in cfg.loan_rates:
        if amount <= upper:
            return float(rate)
    return float(cfg.loan_rates[-1][1])


def annuity(principal: float, annual_rate: float, n_months: int) -> float:
    """Cuota constante (sistema francés); la misma que usa el simulador para el préstamo."""
    if n_months < 1:
        raise ValueError("una anualidad necesita al menos un periodo")
    i = annual_rate / 12.0
    if i <= 0:
        return principal / n_months
    return principal * i / (1 - (1 + i) ** -n_months)


def _median_outflow(hist: History) -> float:
    """Mediana de cargos mensuales: la unidad de importe de toda la rejilla de acciones."""
    outflows = np.asarray(hist.outflows, dtype=float)
    outflows = outflows[np.isfinite(outflows)]
    return float(np.median(outflows)) if len(outflows) else 0.0


def _refinance_offer(hist: History, cfg: SimConfig) -> tuple[Action, float] | None:
    """La refinanciación al tipo justo y el hueco de tipo (`loan_rate − fair`), o `None`.

    `None` es «no es elegible»: sin tipo conocido (solo 87 contratos lo traen), sin deuda viva, sin
    cuota, sin plazo pendiente o si el tipo justo no mejora al actual. Cada quien pone luego su
    umbral sobre el hueco; aquí solo se comprueba lo que haría saltar a `_plan`.
    """
    rate = hist.loan_rate
    if rate is None or not np.isfinite(float(rate)):
        return None
    outstanding = float(hist.loan_outstanding)
    if outstanding <= 0 or float(hist.loan_installment) <= 0 or int(hist.loan_remaining) < 1:
        return None
    fair = fair_loan_rate(outstanding, cfg)
    gap = float(rate) - fair
    if gap <= 0:
        return None
    return Action("refinance", rate=fair), gap


def candidate_actions(hist: History, cfg: SimConfig | None = None) -> list[Action]:
    """Las acciones que esta empresa *puede* tomar este mes, con `NONE` siempre la primera.

    La rejilla es corta a propósito (≤ 8 acciones): el MPC las enumera todas y el asesor tiene que
    poder leer la comparación entera. Toda acción devuelta es elegible para `simulate`; si no lo
    fuera, `_plan` lanzaría `ValueError` en mitad del bucle. Los importes van en múltiplos de la
    mediana de cargos, que es la unidad natural de la empresa: si es 0 no hay importe que proponer y
    solo quedan las acciones sin importe.
    """
    cfg = cfg or SimConfig()
    actions = [NONE]
    room = float(hist.line_limit) - float(hist.line_drawn)
    med_out = _median_outflow(hist)
    if room > 0:
        actions.append(Action("line_cover"))
        if med_out > 0:
            actions.append(Action("line_draw", amount=min(room, med_out)))
    if float(hist.line_limit) <= 0 and med_out > 0:
        actions += [Action("line_open", amount=k * med_out) for k in (1, 2)]
    if float(hist.receivables) > 0:
        actions += [Action("factoring", amount=fraction) for fraction in (0.5, 1.0)]
    if med_out > 0:
        actions += [Action("loan", amount=k * med_out) for k in (1, 2)]
    offer = _refinance_offer(hist, cfg)
    if offer is not None and offer[1] > REFINANCE_MIN_GAP:
        actions.append(offer[0])
    return actions


# --- objetivo y recomendación --------------------------------------------------------------------


def objective(paths: Paths, lam: float, mu: float, cfg: SimConfig | None = None) -> float:
    """`E[coste] + λ·P(rotura) + μ·P(DSCR < suelo)`, en euros.

    λ y μ son precios sombra: λ es lo que la empresa está dispuesta a pagar por quitarse la rotura
    de encima. Un λ del orden de la mediana de cargos deja la frontera donde el asesor la reconoce.
    """
    cfg = cfg or SimConfig()
    return (
        paths.expected_cost()
        + float(lam) * paths.breach_prob()
        + float(mu) * paths.dscr_fail_prob(cfg.dscr_floor)
    )


@dataclass
class Recommendation:
    """Lo que el MPC propone para una empresa y un mes, con la comparación que narra Eve."""

    company_id: str
    month: str
    action: Action
    objective: float
    expected_cost: float
    breach_prob: float
    breach_prob_none: float
    dscr_fail_prob: float
    alternatives: list[dict]  # un dict por candidato, `none` incluida


def _base_seed(rng, cfg: SimConfig) -> int:
    """Semilla base de los sorteos: los candidatos comparten semilla, nunca generador.

    Acepta `None` (usa `cfg.seed`), un entero o un `Generator`; del generador se extrae un entero
    (consumiéndolo una vez), de modo que dos llamadas con el mismo estado dan el mismo barrido.
    """
    if rng is None:
        return int(cfg.seed)
    if isinstance(rng, np.random.Generator):
        return int(rng.integers(0, 2**62))
    if isinstance(rng, (int, np.integer)):
        return int(rng)
    return int(np.random.default_rng(rng).integers(0, 2**62))


def mpc_recommend(
    hist: History,
    cfg: SimConfig | None = None,
    lam: float = 0.0,
    mu: float = 0.0,
    rng=None,
    pool: FlowPool | None = None,
    candidates: list[Action] | None = None,
) -> Recommendation:
    """Enumera los candidatos, los simula pareados y devuelve el que minimiza `objective`.

    Usa `cfg.n_paths` caminos y `cfg.horizon` meses. Empate → `NONE`, que se coloca siempre la
    primera y gana por comparación estricta: si un producto no mejora en el objetivo, no se
    recomienda. Si `candidates` llega sin la acción vacía se le antepone, y si llega con ella en
    otra posición se mueve al frente, porque `breach_prob_none` es la referencia de toda la ficha.
    """
    cfg = cfg or SimConfig()
    supplied = list(candidates) if candidates is not None else candidate_actions(hist, cfg)
    empty = [action for action in supplied if action.kind == "none"]
    # `none` al frente venga como venga: el empate lo gana ella, y es la referencia de la ficha.
    actions = [*(empty or [NONE]), *(a for a in supplied if a.kind != "none")]
    seed = _base_seed(rng, cfg)

    alternatives: list[dict] = []
    breach_none = float("nan")
    best, best_value = 0, None
    for index, action in enumerate(actions):
        # Generador nuevo por candidato desde la misma semilla: mismos sorteos, coste comparable.
        paths = simulate(hist, action, cfg, rng=np.random.default_rng(seed), pool=pool)
        value = objective(paths, lam, mu, cfg)
        alternatives.append({
            "kind": action.kind,
            "amount": float(action.amount),
            "rate": None if action.rate is None else float(action.rate),
            "expected_cost": paths.expected_cost(),
            "breach_prob": paths.breach_prob(),
            "dscr_fail_prob": paths.dscr_fail_prob(cfg.dscr_floor),
            "objective": value,
        })
        if action.kind == "none":
            breach_none = paths.breach_prob()
        if best_value is None or value < best_value:
            best, best_value = index, value

    chosen = alternatives[best]
    return Recommendation(
        company_id=hist.company_id,
        month=hist.month,
        action=actions[best],
        objective=chosen["objective"],
        expected_cost=chosen["expected_cost"],
        breach_prob=chosen["breach_prob"],
        breach_prob_none=breach_none,
        dscr_fail_prob=chosen["dscr_fail_prob"],
        alternatives=alternatives,
    )


# --- líneas base (B2) -----------------------------------------------------------------------------


def do_nothing(hist: History, cfg: SimConfig | None = None, rng=None) -> Action:
    """La línea base honesta: el asesor no llama."""
    return NONE


def _cash_days(hist: History, med_out: float) -> float:
    """Días de caja: saldo menos el bache típico, dividido por el cargo diario."""
    daily = med_out / 30.0
    if daily <= 0:
        return float("inf")
    dips = np.asarray(hist.dips, dtype=float)
    dips = dips[np.isfinite(dips)]
    median_dip = float(np.median(dips)) if len(dips) else 0.0
    return (float(hist.eom) - median_dip) / daily


def advisor_rules(hist: History, cfg: SimConfig | None = None, rng=None) -> Action:
    """La regla de toda la vida: cubrir, abrir línea, anticipar o refinanciar, en ese orden.

    Los umbrales son los del asesor de Embat (`docs/experimentos_productos.md` §B2): 15 días de caja
    para la póliza, 30 días con cartera de más de un mes de cargos para el anticipo y 100 pb de
    hueco de tipo para refinanciar. Es la línea base que el MPC tiene que batir en coste **y** en
    rotura para justificarse.
    """
    cfg = cfg or SimConfig()
    med_out = _median_outflow(hist)
    cash_days = _cash_days(hist, med_out)
    room = float(hist.line_limit) - float(hist.line_drawn)
    if cash_days < 15 and room > 0:
        return Action("line_cover")
    if cash_days < 15 and float(hist.line_limit) <= 0 and med_out > 0:
        return Action("line_open", amount=med_out)
    if float(hist.receivables) > med_out and float(hist.receivables) > 0 and cash_days < 30:
        return Action("factoring", amount=0.5)
    offer = _refinance_offer(hist, cfg)
    if offer is not None and offer[1] >= ADVISOR_MIN_GAP:
        return offer[0]
    return NONE


def miller_orr(
    hist: History,
    cfg: SimConfig | None = None,
    rng=None,
    gamma: float = 30.0,
    deposit_rate: float = 0.006,
) -> Action:
    """Miller–Orr (QJE 1966) en la póliza: al tocar el suelo se dispone hasta el punto de retorno.

    `z = l + (3γσ²/4v)^{1/3}` con `σ²` la varianza diaria del flujo neto (mensual / 30), `v` el
    coste de oportunidad diario de tener el dispuesto y `l = 0,05 × mediana de cargos` el suelo.
    Solo dispone —la pata de amortización del modelo no tiene acción en el simulador— y solo si hay
    póliza con disponible. Es la línea base «reactiva» contra la que el MPC solo gana si el
    horizonte tiene estructura (§B3).
    """
    cfg = cfg or SimConfig()
    room = float(hist.line_limit) - float(hist.line_drawn)
    med_out = _median_outflow(hist)
    floor = 0.05 * med_out
    if room <= 0 or float(hist.eom) >= floor:
        return NONE
    inflows = np.asarray(hist.inflows, dtype=float)
    outflows = np.asarray(hist.outflows, dtype=float)
    length = min(len(inflows), len(outflows))
    net = inflows[-length:] - outflows[-length:] if length else np.zeros(0)
    variance = float(np.var(net)) / 30.0 if len(net) else 0.0
    v = (cfg.line_rate - deposit_rate) / 365.0
    spread = (3.0 * gamma * variance / (4.0 * v)) ** (1.0 / 3.0) if variance > 0 and v > 0 else 0.0
    amount = min(floor + spread - float(hist.eom), room)
    if amount <= 0:
        return NONE
    return Action("line_draw", amount=amount)


def adl_threshold(
    remaining_months: int,
    cfg: SimConfig | None = None,
    rho: float = 0.05,
    sigma: float = 0.0109,
    inflation: float = 0.02,
) -> float:
    """Umbral de refinanciación en forma cerrada de Agarwal–Driscoll–Laibson (JMCB 2013).

    `x* = [φ + W(−e^{−φ})]/ψ` con `ψ = √(2(ρ+λ))/σ` y `φ = 1 + ψ(ρ+λ)·C/M`, rama principal de
    Lambert. Con la rama principal el argumento cae en [−1/e, 0) y `x*` sale **positivo**: es el
    descuento de tipo exigido, 97 pb con los parámetros por defecto y 36 meses de plazo, dentro de
    los 107–193 pb que cita `docs/experimentos_productos.md` §B2.iv. El encargo lo escribe con el
    signo contrario (`fair − loan_rate ≤ x*`); es la misma desigualdad leída al revés y aquí se usa
    en su forma positiva, que es la única que distingue un hueco de 300 pb de uno de 20 pb.
    """
    cfg = cfg or SimConfig()
    hazard = 12.0 / max(int(remaining_months), 1) + inflation
    psi = np.sqrt(2.0 * (rho + hazard)) / sigma
    phi = 1.0 + psi * (rho + hazard) * float(cfg.refinance_closing_cost)
    return float((phi + lambertw(-np.exp(-phi)).real) / psi)


def adl_refinance(
    hist: History,
    cfg: SimConfig | None = None,
    rng=None,
    rho: float = 0.05,
    sigma: float = 0.0109,
    inflation: float = 0.02,
) -> Action:
    """Refinancia solo si el hueco de tipo supera el umbral cerrado de ADL; si no, `NONE`."""
    cfg = cfg or SimConfig()
    offer = _refinance_offer(hist, cfg)
    if offer is None:
        return NONE
    action, gap = offer
    threshold = adl_threshold(hist.loan_remaining, cfg, rho=rho, sigma=sigma, inflation=inflation)
    return action if gap >= threshold else NONE


def combine(*policies: Policy) -> Policy:
    """Apila políticas: gana la primera que no dice `NONE` (p. ej. ADL sobre las reglas)."""

    def stacked(hist: History, cfg: SimConfig | None = None, rng=None) -> Action:
        for policy in policies:
            action = policy(hist, cfg, rng)
            if action is not None and action.kind != "none":
                return action
        return NONE

    return stacked


def _resolve(value, hist: History) -> float:
    """λ y μ admiten un número o una función de la historia (λ = k × mediana de cargos)."""
    return float(value(hist)) if callable(value) else float(value)


def make_mpc_policy(lam, mu, pool: FlowPool | None = None, n_paths: int = 200) -> Policy:
    """El MPC como política para `evaluate_policy`, con menos caminos que la ficha en pantalla.

    `lam` y `mu` pueden ser números o funciones de la historia —`lambda h: 0.5 * np.median(
    h.outflows)`— para poner el precio sombra de la rotura en la escala de cada empresa en vez de
    en euros absolutos, que es lo que hace comparable a una pyme de 50 K con una de 5 M.
    """

    def policy(hist: History, cfg: SimConfig | None = None, rng=None) -> Action:
        cfg = cfg or SimConfig()
        run = replace(cfg, n_paths=int(n_paths))
        recommendation = mpc_recommend(
            hist, run, _resolve(lam, hist), _resolve(mu, hist), rng, pool=pool
        )
        return recommendation.action

    return policy


# --- bucle cerrado (B3) ---------------------------------------------------------------------------


def _check_shift(shift: dict | None) -> dict | None:
    """Valida el desplazamiento: claves conocidas y escalas > 0 (hay que poder deshacerlas)."""
    if not shift:
        return None
    unknown = set(shift) - set(SHIFT_KEYS)
    if unknown:
        raise ValueError(f"claves de shift desconocidas: {sorted(unknown)}; válidas: {SHIFT_KEYS}")
    for key in ("inflow_scale", "dip_scale"):
        if float(shift.get(key, 1.0)) <= 0:
            raise ValueError(f"{key} tiene que ser > 0")
    return dict(shift)


def _shift_config(cfg: SimConfig, shift: dict | None) -> SimConfig:
    """Precios del mundo: `rate_shock` sobre póliza, factoring y curva de préstamo."""
    shock = float(shift.get("rate_shock", 0.0)) if shift else 0.0
    if shock == 0.0:
        return cfg
    return replace(
        cfg,
        line_rate=cfg.line_rate + shock,
        factoring_rate=cfg.factoring_rate + shock,
        loan_rates=tuple((bound, rate + shock) for bound, rate in cfg.loan_rates),
    )


def _copy_history(hist: History) -> History:
    """Copia con arrays propios: ninguna función de este módulo toca la historia que recibe."""
    return replace(
        hist,
        inflows=np.array(hist.inflows, dtype=float),
        outflows=np.array(hist.outflows, dtype=float),
        dips=np.array(hist.dips, dtype=float),
    )


def _shift_history(hist: History, shift: dict | None) -> History:
    """La historia de la que sortea el mundo: entradas y baches escalados."""
    if not shift:
        return hist
    inflow_scale = float(shift.get("inflow_scale", 1.0))
    dip_scale = float(shift.get("dip_scale", 1.0))
    if inflow_scale == 1.0 and dip_scale == 1.0:
        return hist
    return replace(
        hist,
        inflows=np.asarray(hist.inflows, dtype=float) * inflow_scale,
        dips=np.asarray(hist.dips, dtype=float) * dip_scale,
    )


def _shift_pool(pool: FlowPool | None, shift: dict | None) -> FlowPool | None:
    """El pool, a la misma escala que la historia desplazada.

    Con historia corta, `projection._draw_triplets` llena parte de los sorteos con
    `pool.sample(rng, count, med_out)`, y ese muestreo escala por la mediana de **cargos**, que el
    desvío no toca. Sin desplazar también el pool, esos tripletes entrarían al mundo sin escalar y
    `_unshift_draws` los dividiría igual que a los demás: la entrada del pool se arrastraría al
    doble (96 K en vez de 48 K con `inflow_scale = 0,5`) y el bache a la mitad. Los dos errores se
    suman a favor de la empresa, y justo en las de historia corta, que son las que peor lo llevan en
    la tabla de estrés.
    """
    if pool is None or not shift:
        return pool
    inflow_scale = float(shift.get("inflow_scale", 1.0))
    dip_scale = float(shift.get("dip_scale", 1.0))
    if inflow_scale == 1.0 and dip_scale == 1.0:
        return pool
    triplets = np.array(pool.triplets, dtype=float)
    triplets[:, 0] *= inflow_scale
    triplets[:, 2] *= dip_scale
    return FlowPool.from_triplets(triplets)


def _unshift_draws(paths: Paths, shift: dict | None) -> Paths:
    """Devuelve el sorteo a la escala de la empresa para que el desvío no se componga."""
    if not shift or paths.draws is None:
        return paths
    inflow_scale = float(shift.get("inflow_scale", 1.0))
    dip_scale = float(shift.get("dip_scale", 1.0))
    if inflow_scale == 1.0 and dip_scale == 1.0:
        return paths
    draws = paths.draws.copy()
    draws[:, :, 0] /= inflow_scale
    draws[:, :, 2] /= dip_scale
    return replace(paths, draws=draws)


def _step(hist: History, action: Action, step_cfg: SimConfig, rng, pool, shift):
    """Un mes realizado: `(paths de un camino y un mes, historia del mes siguiente)`.

    `pool` tiene que llegar ya desplazado (`_shift_pool`), porque el desvío se aplica a la historia
    y a las dos ramas de `_draw_triplets` por igual.
    """
    world = _shift_history(hist, shift)
    paths = simulate(world, action, step_cfg, rng=rng, pool=pool, horizon=1)
    return paths, advance(hist, _unshift_draws(paths, shift), action, k=0, cfg=step_cfg)


def _month_outcome(paths: Paths, cfg: SimConfig) -> tuple[float, bool, bool]:
    """Coste, rotura y fallo de DSCR del mes realizado (un solo camino: probabilidad ∈ {0, 1})."""
    return paths.expected_cost(), paths.breach_prob() > 0, paths.dscr_fail_prob(cfg.dscr_floor) > 0


def evaluate_policy(
    policy: Policy,
    hists: list[History],
    cfg: SimConfig | None = None,
    months: int = 12,
    seed: int = 0,
    pool: FlowPool | None = None,
    shift: dict | None = None,
) -> pd.DataFrame:
    """Corre `policy` en bucle cerrado `months` meses sobre cada historia y resume lo que pasó.

    Cada mes: la política decide sobre la historia y la configuración **sin desplazar** (es su
    modelo), y el mundo ejecuta un mes con `np.random.default_rng([seed, i, j])` — la misma semilla
    para todas las políticas, así que dos políticas se comparan sobre el mismo futuro (números
    aleatorios comunes) y la diferencia no es ruido. La aleatoriedad propia de la política (los
    sorteos del MPC) sale de `[seed, i, j, 1]`, que es independiente de la del mundo.

    Devuelve una fila por empresa: `company_id, total_cost, breach, n_breach_months,
    dscr_fail_months, actions`. Ojo con `total_cost`: por el paso de un mes (ver el docstring del
    módulo) los productos con calendario salen baratos.
    """
    cfg = cfg or SimConfig()
    shift = _check_shift(shift)
    step_cfg = replace(_shift_config(cfg, shift), n_paths=1)
    step_pool = _shift_pool(pool, shift)  # una vez, no una por mes

    rows = []
    for i, start in enumerate(hists):
        hist = _copy_history(start)
        total_cost, n_breach, dscr_fail, actions = 0.0, 0, 0, []
        for j in range(months):
            action = policy(hist, cfg, np.random.default_rng([seed, i, j, 1])) or NONE
            paths, hist = _step(hist, action, step_cfg, np.random.default_rng([seed, i, j]),
                                step_pool, shift)
            cost, breached, failed = _month_outcome(paths, cfg)
            total_cost += cost
            n_breach += int(breached)
            dscr_fail += int(failed)
            actions.append(action.kind)
        rows.append({
            "company_id": start.company_id,
            "total_cost": total_cost,
            "breach": n_breach > 0,
            "n_breach_months": n_breach,
            "dscr_fail_months": dscr_fail,
            "actions": actions,
        })
    return pd.DataFrame(rows, columns=RESULT_COLUMNS)


def _continuation(hist: History) -> Action:
    """Lo que hace el oráculo en los meses 2..H del rollout: mantener la póliza encendida.

    El modelo del MPC es `simulate(horizon=H)` con la acción puesta, y ahí una facilidad como
    `line_cover` (o la línea que acaba de abrir `line_open`) cubre descubiertos **los H meses**. El
    rollout del oráculo va mes a mes, así que si continuara con `NONE` valoraría la cobertura por un
    solo mes y la compararía contra un MPC que la ve entera: medido, 40 379 € (la rotura se come el
    λ) frente a 176,77 € y rotura 0. Por eso la continuación es `line_cover` mientras quede
    disponible —que es además la condición de elegibilidad de `_plan`— y `NONE` cuando no queda.
    """
    if float(hist.line_limit) - float(hist.line_drawn) > 0:
        return Action("line_cover")
    return NONE


def _realised_objective(
    hist: History, action: Action, step_cfg: SimConfig, seeds, pool, lam: float, mu: float
) -> float:
    """Objetivo *realizado* de tomar `action` ahora y seguir con la póliza puesta, sobre `seeds`."""
    total_cost, breached, failed = 0.0, False, False
    for index, seed in enumerate(seeds):
        paths, hist = _step(hist, action if index == 0 else _continuation(hist), step_cfg,
                            np.random.default_rng(seed), pool, None)
        cost, month_breach, month_fail = _month_outcome(paths, step_cfg)
        total_cost += cost
        breached |= month_breach
        failed |= month_fail
    return total_cost + float(lam) * breached + float(mu) * failed


def perfect_foresight(
    hists: list[History],
    cfg: SimConfig | None = None,
    months: int = 12,
    seed: int = 0,
    pool: FlowPool | None = None,
    lam: float = 0.0,
    mu: float = 0.0,
) -> pd.DataFrame:
    """El oráculo: cada mes elige el candidato que mejor sale **sobre los sorteos que ocurrirán**.

    Mismas semillas de mundo que `evaluate_policy`, así que es comparable fila a fila: en el mes `j`
    prueba cada candidato con los generadores futuros `[seed, i, j+k]`, `k = 0..cfg.horizon−1`,
    continuando con la póliza puesta (`_continuation`) como hace el modelo del MPC, y se queda con
    el de menor objetivo realizado (`coste + λ·rotura + μ·fallo de DSCR`, con indicadores en lugar
    de probabilidades).

    Es un **oráculo voraz con previsión realizada a `cfg.horizon` meses**, no el LP de 12 meses de
    `docs/experimentos_productos.md` §B2.v: decide mes a mes y no optimiza la secuencia entera, así
    que no es cota superior del valor de cualquier política. Dos consecuencias prácticas: en el
    pitch hay que llamarlo por su nombre, y comparar su objetivo contra una tabla de `months <
    cfg.horizon` no mide lo que el oráculo optimiza (compra protección para meses que la tabla no
    mira y sale «peor» que una política miope).

    Devuelve las columnas de `evaluate_policy` más `objective`, el objetivo realizado de la corrida
    entera.
    """
    cfg = cfg or SimConfig()
    step_cfg = replace(cfg, n_paths=1)

    rows = []
    for i, start in enumerate(hists):
        hist = _copy_history(start)
        total_cost, n_breach, dscr_fail, actions = 0.0, 0, 0, []
        for j in range(months):
            seeds = [[seed, i, j + k] for k in range(cfg.horizon)]
            best, best_value = NONE, None
            for action in candidate_actions(hist, cfg):
                value = _realised_objective(hist, action, step_cfg, seeds, pool, lam, mu)
                if best_value is None or value < best_value:
                    best, best_value = action, value
            paths, hist = _step(hist, best, step_cfg, np.random.default_rng([seed, i, j]),
                                pool, None)
            cost, breached, failed = _month_outcome(paths, cfg)
            total_cost += cost
            n_breach += int(breached)
            dscr_fail += int(failed)
            actions.append(best.kind)
        rows.append({
            "company_id": start.company_id,
            "total_cost": total_cost,
            "breach": n_breach > 0,
            "n_breach_months": n_breach,
            "dscr_fail_months": dscr_fail,
            "actions": actions,
            "objective": total_cost + float(lam) * (n_breach > 0) + float(mu) * (dscr_fail > 0),
        })
    return pd.DataFrame(rows, columns=[*RESULT_COLUMNS, "objective"])
