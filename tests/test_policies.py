import numpy as np
import pandas as pd
import pytest

from xray import policies as pl
from xray import projection as pj

CFG = pj.SimConfig(n_paths=50, horizon=6, seed=7)
LOAN = {"loan_outstanding": 200_000.0, "loan_installment": 6_000.0, "loan_remaining": 36}


def _hist(eom=10_000.0, months=12, inflow=50_000.0, outflow=48_000.0, dip=3_000.0, **kw):
    """Historia plana: 12 meses de flujos constantes, sin productos salvo lo que pase `kw`."""
    return pj.History(company_id="C", month="2026-01", eom=eom,
                      inflows=np.full(months, inflow), outflows=np.full(months, outflow),
                      dips=np.full(months, dip),
                      operating_share=0.8, debt_service_m=1_000.0, **kw)


def _varied(eom=10_000.0, months=12, dip=3_000.0, **kw):
    """Igual, pero con entradas que alternan 52 K / 44 K: varianza > 0 para Miller–Orr."""
    swing = 4_000.0 * np.array([1.0, -1.0] * (months // 2 + 1))[:months]
    return pj.History(company_id="C", month="2026-01", eom=eom,
                      inflows=48_000.0 + swing, outflows=np.full(months, 48_000.0),
                      dips=np.full(months, dip),
                      operating_share=0.8, debt_service_m=1_000.0, **kw)


def test_fair_rate_buckets_and_annuity():
    cfg = pj.SimConfig()
    assert pl.fair_loan_rate(100_000, cfg) == 0.0356
    assert pl.fair_loan_rate(500_000, cfg) == 0.0359
    assert pl.fair_loan_rate(2_000_000, cfg) == 0.0379
    assert pl.annuity(100_000, 0.0356, 36) == pytest.approx(2_932.6, rel=1e-3)
    assert pl.annuity(1_200, 0.0, 12) == pytest.approx(100.0)


def test_candidate_actions_without_line_offers_opening():
    acts = pl.candidate_actions(_hist(), CFG)
    kinds = [a.kind for a in acts]
    assert kinds[0] == "none"
    assert "line_open" in kinds and "line_cover" not in kinds and "line_draw" not in kinds
    assert "refinance" not in kinds and "factoring" not in kinds
    assert [a.amount for a in acts if a.kind == "line_open"] == [48_000.0, 96_000.0]
    assert [a.amount for a in acts if a.kind == "loan"] == [48_000.0, 96_000.0]


def test_candidate_actions_with_line_offers_cover_and_draw():
    acts = pl.candidate_actions(_hist(line_limit=20_000.0, line_drawn=5_000.0), CFG)
    kinds = [a.kind for a in acts]
    assert "line_cover" in kinds and "line_open" not in kinds
    draw = next(a for a in acts if a.kind == "line_draw")
    assert draw.amount == pytest.approx(15_000.0)  # el disponible manda sobre la mediana de cargos


def test_candidate_actions_refinance_needs_known_rate_and_gap():
    sin_tipo = pl.candidate_actions(_hist(**LOAN), CFG)
    assert not [a for a in sin_tipo if a.kind == "refinance"]
    caro = pl.candidate_actions(_hist(loan_rate=0.06, **LOAN), CFG)
    ref = next(a for a in caro if a.kind == "refinance")
    assert ref.rate == pytest.approx(0.0356)
    barato = pl.candidate_actions(_hist(loan_rate=0.0375, **LOAN), CFG)  # 19 pb: menos de 50
    assert not [a for a in barato if a.kind == "refinance"]


def test_candidate_actions_are_all_eligible_for_the_simulator():
    h = _hist(eom=-2_000.0, line_limit=20_000.0, line_drawn=5_000.0, receivables=80_000.0,
              loan_rate=0.06, **LOAN)
    acts = pl.candidate_actions(h, CFG)
    assert {a.kind for a in acts} == {"none", "line_cover", "line_draw", "factoring", "loan",
                                      "refinance"}
    for action in acts:
        pj.simulate(h, action, CFG)  # ninguna acción propuesta hace saltar `_plan`


def test_objective_adds_the_two_penalties():
    paths = pj.Paths(eom=np.zeros((2, 2)),
                     min_balance=np.array([[-1.0, 2.0], [3.0, 4.0]]),
                     cost=np.array([[10.0, 5.0], [20.0, 5.0]]),
                     debt_service=np.full((2, 2), 100.0),
                     op_inflows=np.array([[100.0, 100.0], [300.0, 300.0]]))
    cfg = pj.SimConfig(dscr_floor=1.2)
    assert paths.expected_cost() == 20.0 and paths.breach_prob() == 0.5
    assert paths.dscr_fail_prob(cfg.dscr_floor) == 0.5
    assert pl.objective(paths, 1_000.0, 100.0, cfg) == pytest.approx(20 + 500 + 50)


def test_mpc_covers_a_breaching_company():
    h = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0)
    rec = pl.mpc_recommend(h, CFG, lam=100_000.0, mu=0.0, rng=11)
    assert rec.company_id == "C" and rec.month == "2026-01"
    assert rec.action.kind != "none"
    assert rec.breach_prob_none == 1.0 and rec.breach_prob <= rec.breach_prob_none
    kinds = [alt["kind"] for alt in rec.alternatives]
    assert "none" in kinds and len(kinds) == len(pl.candidate_actions(h, CFG))
    assert rec.objective == pytest.approx(min(alt["objective"] for alt in rec.alternatives))
    none_alt = next(alt for alt in rec.alternatives if alt["kind"] == "none")
    assert rec.objective < none_alt["objective"]


def test_mpc_leaves_a_calm_company_alone():
    rec = pl.mpc_recommend(_hist(line_limit=20_000.0), CFG, lam=100_000.0, mu=0.0, rng=11)
    assert rec.action is pj.NONE and rec.expected_cost == 0.0 and rec.breach_prob == 0.0


def test_evaluate_do_nothing_on_a_calm_company():
    h = _hist()
    rows = pl.evaluate_policy(pl.do_nothing, [h], CFG, months=6, seed=3)
    assert list(rows.columns) == ["company_id", "total_cost", "breach", "n_breach_months",
                                  "dscr_fail_months", "actions"]
    row = rows.iloc[0]
    assert len(rows) == 1 and row["company_id"] == "C"
    assert row["total_cost"] == 0.0 and not row["breach"]
    assert row["n_breach_months"] == 0 and row["dscr_fail_months"] == 0
    assert row["actions"] == ["none"] * 6
    assert h.eom == 10_000.0 and np.array_equal(h.inflows, np.full(12, 50_000.0))


def test_evaluate_with_the_same_seed_is_reproducible():
    hs = [_varied(eom=1_000.0, dip=6_000.0, line_limit=20_000.0), _varied(eom=500.0, dip=4_000.0)]
    policy = pl.make_mpc_policy(lam=50_000.0, mu=0.0, n_paths=30)
    first = pl.evaluate_policy(policy, hs, CFG, months=3, seed=5)
    second = pl.evaluate_policy(policy, hs, CFG, months=3, seed=5)
    pd.testing.assert_frame_equal(first, second)
    other = pl.evaluate_policy(policy, hs, CFG, months=3, seed=6)
    assert not first["total_cost"].equals(other["total_cost"])


def test_shift_hurts_without_touching_the_policy_or_the_history():
    h = _hist()
    clean = pl.evaluate_policy(pl.do_nothing, [h], CFG, months=3, seed=1)
    stress = {"inflow_scale": 0.5, "dip_scale": 1.5, "rate_shock": 0.02}
    stressed = pl.evaluate_policy(pl.do_nothing, [h], CFG, months=3, seed=1, shift=stress)
    assert clean.iloc[0]["n_breach_months"] == 0 and clean.iloc[0]["total_cost"] == 0.0
    assert stressed.iloc[0]["n_breach_months"] == 3 and stressed.iloc[0]["total_cost"] > 0
    assert h.eom == 10_000.0 and np.array_equal(h.inflows, np.full(12, 50_000.0))


LAM, MU = 40_000.0, 0.0


def _realised(frame):
    """El objetivo realizado de una corrida de `evaluate_policy`, como lo calcula el oráculo."""
    return (frame["total_cost"] + LAM * frame["breach"]
            + MU * (frame["dscr_fail_months"] > 0)).to_numpy()


def test_perfect_foresight_is_at_least_as_good_as_mpc():
    """El oráculo no pierde contra el MPC cuando se le mide la ventana que optimiza.

    `months = cfg.horizon` no es un detalle del test: el oráculo es voraz con previsión a
    `cfg.horizon` meses, así que medirle una tabla más corta le cobra la protección que compra para
    meses que la tabla no mira (con `horizon=6, months=3` pierde por 12,65 € en 1 de 8 semillas, y
    no es un fallo suyo). Con la ventana bien puesta gana o empata en 8 de 8.
    """
    hs = [_varied(eom=1_000.0, dip=6_000.0, line_limit=30_000.0),
          _varied(eom=2_000.0, dip=5_000.0, line_limit=30_000.0)]
    cfg = pj.SimConfig(n_paths=50, horizon=6, seed=2)
    oracle = pl.perfect_foresight(hs, cfg, months=6, seed=4, lam=LAM, mu=MU)
    mpc = pl.evaluate_policy(pl.make_mpc_policy(LAM, MU, n_paths=60), hs, cfg, months=6, seed=4)
    gap = oracle["objective"].to_numpy() - _realised(mpc)
    assert list(oracle.columns)[-1] == "objective"
    assert (gap <= 1e-9).all()
    assert (gap < 0).any()  # canario: si el oráculo solo empatara, el test no estaría midiendo nada


def test_perfect_foresight_picks_the_best_realised_candidate():
    """Con horizonte de un mes el oráculo *es* el mínimo sobre la rejilla, candidato a candidato.

    Es la comprobación de que sus semillas de rollout son exactamente las del paso real: si no lo
    fueran, el objetivo que reporta no coincidiría con el de correr ese mismo candidato en
    `evaluate_policy`.
    """
    hs = [_varied(eom=1_000.0, dip=6_000.0, line_limit=30_000.0),
          _varied(eom=2_000.0, dip=5_000.0, line_limit=30_000.0)]
    cfg = pj.SimConfig(n_paths=50, horizon=1, seed=2)
    oracle = pl.perfect_foresight(hs, cfg, months=1, seed=4, lam=LAM, mu=MU)

    best = np.full(len(hs), np.inf)
    for index in range(max(len(pl.candidate_actions(h, cfg)) for h in hs)):
        def pick(hist, c=None, rng=None, index=index):
            actions = pl.candidate_actions(hist, c or cfg)
            return actions[min(index, len(actions) - 1)]

        best = np.minimum(best, _realised(pl.evaluate_policy(pick, hs, cfg, months=1, seed=4)))
    assert oracle["objective"].to_numpy() == pytest.approx(best)


def test_adl_refinance_waits_for_a_big_gap():
    caro = _hist(loan_rate=0.0656, **LOAN)  # 300 pb sobre el tipo justo (3,56 %)
    barato = _hist(loan_rate=0.0376, **LOAN)  # 20 pb
    action = pl.adl_refinance(caro, CFG)
    assert action.kind == "refinance" and action.rate == pytest.approx(0.0356)
    assert pl.adl_refinance(barato, CFG).kind == "none"
    assert pl.adl_refinance(_hist(**LOAN), CFG).kind == "none"  # sin tipo conocido no hay umbral


def test_advisor_rules_covers_opens_and_factors():
    con_linea = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0)
    assert pl.advisor_rules(con_linea, CFG).kind == "line_cover"
    abierta = pl.advisor_rules(_hist(eom=1_000.0, dip=5_000.0), CFG)
    assert abierta.kind == "line_open" and abierta.amount == pytest.approx(48_000.0)
    factor = pl.advisor_rules(_hist(eom=30_000.0, receivables=100_000.0), CFG)  # 16,9 días de caja
    assert factor.kind == "factoring" and factor.amount == 0.5
    assert pl.advisor_rules(_hist(eom=500_000.0), CFG) is pj.NONE


def test_miller_orr_draws_only_below_the_floor():
    action = pl.miller_orr(_varied(eom=100.0, line_limit=50_000.0), CFG)
    assert action.kind == "line_draw" and 0 < action.amount <= 50_000.0
    assert pl.miller_orr(_varied(eom=100_000.0, line_limit=50_000.0), CFG).kind == "none"
    assert pl.miller_orr(_varied(eom=100.0), CFG).kind == "none"  # sin línea no hay disposición


def test_combine_takes_the_first_non_none():
    h = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0, loan_rate=0.0656, **LOAN)
    assert pl.combine(pl.adl_refinance, pl.advisor_rules)(h, CFG, None).kind == "refinance"
    assert pl.combine(pl.do_nothing, pl.advisor_rules)(h, CFG, None).kind == "line_cover"
    assert pl.combine(pl.do_nothing, pl.do_nothing)(h, CFG, None) is pj.NONE


# --- regresiones de la ronda 1 de revisión --------------------------------------------------------


def test_supplied_candidates_still_break_ties_towards_none():
    """Empate → `NONE` también cuando los candidatos llegan de fuera y `none` no va la primera."""
    calm = _hist(line_limit=20_000.0)  # no rompe: cubrir no cuesta nada y tampoco cambia nada
    rec = pl.mpc_recommend(calm, CFG, lam=100_000.0, mu=0.0, rng=11,
                           candidates=[pj.Action("line_cover"), pj.NONE])
    assert {alt["objective"] for alt in rec.alternatives} == {0.0}  # el empate es real
    assert rec.action.kind == "none" and rec.alternatives[0]["kind"] == "none"
    assert len(rec.alternatives) == 2


def test_shift_scales_the_pool_like_the_history():
    """Con historia corta el sorteo viene del pool, y el pool también tiene que ir desplazado.

    La historia propia y el pool están calibrados para dar el mismo triplete (48 K de entradas,
    4,8 K de bache), así que venga el sorteo de donde venga, lo que se arrastra al mes siguiente
    tiene que ser ese valor sin escalar. Si el pool entrara al mundo sin desplazar, el desescalado
    lo devolvería inflado (96 K de entradas, 3,2 K de bache).
    """
    seen: list[tuple[float, float]] = []

    def spy(hist, cfg=None, rng=None):
        seen.append((float(hist.inflows[-1]), float(hist.dips[-1])))
        return pj.NONE

    hs = [pj.History(company_id=f"C{i}", month="2026-01", eom=200_000.0,
                     inflows=np.full(1, 48_000.0), outflows=np.full(1, 48_000.0),
                     dips=np.full(1, 4_800.0), operating_share=0.8, debt_service_m=0.0)
          for i in range(20)]
    pool = pj.FlowPool.from_triplets(np.array([[1.0, 1.0, 0.1]] * 50))
    cfg = pj.SimConfig(n_paths=1, horizon=1, seed=0)
    pl.evaluate_policy(spy, hs, cfg, months=2, seed=0, pool=pool,
                       shift={"inflow_scale": 0.5, "dip_scale": 1.5})
    carried = seen[1::2]  # la segunda llamada de cada empresa ya lleva el sorteo del primer mes
    assert len(carried) == 20
    for inflow, dip in carried:
        assert inflow == pytest.approx(48_000.0) and dip == pytest.approx(4_800.0)
