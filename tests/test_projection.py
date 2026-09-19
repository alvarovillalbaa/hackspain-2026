import numpy as np
import pandas as pd
import pytest

from xray import projection as pj


def _hist(eom=10_000.0, months=12, inflow=50_000.0, outflow=48_000.0, dip=3_000.0, **kw):
    return pj.History(company_id="C", month="2026-01", eom=eom,
                      inflows=np.full(months, inflow), outflows=np.full(months, outflow),
                      dips=np.full(months, dip),
                      operating_share=0.8, debt_service_m=1_000.0, **kw)


def test_neutral_scenario_reproduces_history_median():
    h = _hist()
    p = pj.simulate(h, cfg=pj.SimConfig(n_paths=200, horizon=6, seed=1))
    med = p.eom_quantiles((0.5,))[0]
    # flujos constantes → línea recta
    assert np.allclose(med, 10_000 + 2_000 * np.arange(1, 7), atol=1e-6)
    assert p.breach_prob() == 0.0 and p.expected_cost() == 0.0


def test_short_history_does_not_explode():
    h = _hist(months=3)
    pool = pj.FlowPool.from_triplets(np.array([[1.0, 0.95, 0.05]] * 50))
    p = pj.simulate(h, cfg=pj.SimConfig(n_paths=100, horizon=6), pool=pool)
    assert np.isfinite(p.eom).all() and np.isfinite(p.min_balance).all()


def test_line_cover_removes_breach_and_costs_interest():
    # min = eom − 5 000 < 0
    h = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0, line_drawn=0.0)
    cfg = pj.SimConfig(n_paths=50, horizon=3)
    none = pj.simulate(h, pj.NONE, cfg)
    cov = pj.simulate(h, pj.Action("line_cover"), cfg)
    assert none.breach_prob() == 1.0 and cov.breach_prob() == 0.0
    # interés < descubierto al 18 %
    assert cov.expected_cost() > 0 and cov.expected_cost() < none.expected_cost()


def test_loan_never_reduces_breach_less_than_its_cash_and_adds_installments():
    h = _hist(eom=-2_000.0)
    cfg = pj.SimConfig(n_paths=50, horizon=6)
    loan = pj.simulate(h, pj.Action("loan", amount=60_000.0), cfg)
    assert loan.breach_prob() < pj.simulate(h, pj.NONE, cfg).breach_prob()
    i = 0.0356 / 12
    inst = 60_000 * i / (1 - (1 + i) ** -36)
    assert np.allclose(loan.debt_service[:, 1:], 1_000.0 + inst)
    assert loan.cost[:, 1].mean() == pytest.approx(i * 60_000, rel=1e-3)  # interés del primer mes


def test_more_installment_never_reduces_breach():
    h = _hist(eom=500.0, dip=2_000.0)
    cfg = pj.SimConfig(n_paths=100, horizon=6, seed=3)
    small = pj.simulate(h, pj.Action("loan", amount=1_000.0), cfg).breach_prob()
    big = pj.simulate(h, pj.Action("loan", amount=1_000_000.0), cfg).breach_prob()
    assert big <= small  # más caja ahora domina a la cuota; el test de sentido común del slice #6


def test_factoring_timing_and_cost():
    h = _hist(receivables=100_000.0)
    cfg = pj.SimConfig(n_paths=20, horizon=6)
    f = pj.simulate(h, pj.Action("factoring", amount=0.5), cfg)
    none = pj.simulate(h, pj.NONE, cfg)
    r = 50_000.0
    expected_cost = 0.005 * r + 0.06 * 0.85 * r * 60 / 360
    assert f.cost[:, 0].mean() == pytest.approx(expected_cost, rel=1e-6)
    ahora = (f.eom[:, 0] - none.eom[:, 0]).mean()
    despues = (f.eom[:, 2] - none.eom[:, 2]).mean()
    assert ahora == pytest.approx(0.85 * r - expected_cost, rel=1e-6)
    assert despues == pytest.approx(-expected_cost, rel=1e-6)  # las vendidas ya no llegan


def test_refinance_saves_and_requires_known_rate():
    h = _hist(loan_outstanding=200_000.0, loan_installment=6_000.0, loan_rate=0.06,
              loan_remaining=36)
    cfg = pj.SimConfig(n_paths=20, horizon=6)
    r = pj.simulate(h, pj.Action("refinance", rate=0.035), cfg)
    assert r.cost[:, 0].mean() == pytest.approx(0.0075 * 200_000, rel=1e-6)
    assert (r.cost[:, 1:] < 0).all()
    with pytest.raises(ValueError):
        sin_tipo = _hist(loan_outstanding=200_000.0, loan_installment=6_000.0)
        pj.simulate(sin_tipo, pj.Action("refinance", rate=0.035), cfg)


def test_advance_moves_one_month():
    h = _hist(line_limit=10_000.0)
    cfg = pj.SimConfig(n_paths=5, horizon=1, seed=0)
    p = pj.simulate(h, pj.Action("line_draw", amount=4_000.0), cfg)
    nxt = pj.advance(h, p, pj.Action("line_draw", amount=4_000.0), k=2, cfg=cfg)
    assert nxt.month == "2026-02" and nxt.eom == pytest.approx(p.eom[2, 0])
    assert nxt.line_drawn == 4_000.0
    assert len(nxt.inflows) == 12


def test_realized_breach_and_calibrate():
    months = pd.period_range("2025-01", periods=9, freq="M").astype(str)
    f = pd.DataFrame({"company_id": "C", "month": months,
                      "min_balance_eur": [1, 1, -1, 1, 1, 1, 1, 1, 1]})
    rb = pj.realized_breach(f, h=6)
    by_month = rb.set_index("month")["breach6"]
    assert by_month.loc["2025-01"] == 1.0 and by_month.loc["2025-03"] == 0.0
    assert np.isnan(by_month.loc["2025-04"])  # faltan meses futuros
    iso = pj.calibrate(pd.Series([0.1, 0.5, 0.9, 0.95]), pd.Series([0, 0, 1, 1]))
    assert iso.predict([0.9])[0] >= iso.predict([0.1])[0]


# --- regresiones de la ronda 1 de revisión ---------------------------------------------------


def test_line_cover_settles_its_interest_inside_the_reported_balance():
    """El saldo de cierre ya lleva el interés de la póliza: no queda nada diferido al mes que viene.

    Con bache constante, el cierre del mes es el mínimo más el bache menos lo que se liquidó; si el
    interés se aplazara (como hacía antes), el saldo reportado saldría alto por ese importe y
    `advance` lo perdería al arrancar de él.
    """
    h = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0, line_drawn=0.0)
    p = pj.simulate(h, pj.Action("line_cover"), pj.SimConfig(n_paths=10, horizon=3))
    assert (p.cost > 0).all()  # hay interés que liquidar los tres meses
    assert np.allclose(p.eom, p.min_balance + 5_000.0 - p.cost)
    assert (p.min_balance >= 0).all()  # la liquidación no toca el mínimo, que es de antes


def test_advance_hands_over_the_settled_balance():
    """`advance` arranca del saldo reportado, y ese saldo ya pagó el interés del mes (fix 1)."""
    h = _hist(eom=1_000.0, dip=5_000.0, line_limit=20_000.0, line_drawn=0.0)
    cfg = pj.SimConfig(n_paths=4, horizon=1, seed=7)
    cover = pj.Action("line_cover")
    step = pj.simulate(h, cover, cfg)
    nxt = pj.advance(h, step, cover, k=0, cfg=cfg)
    drawn = step.line_draws[0, 0]
    assert drawn == pytest.approx(2_000.0)  # 1 000 + 50 000 − 48 000 − 5 000 = −2 000
    assert nxt.eom == pytest.approx(1_000.0 + 50_000 - 48_000 + drawn - step.cost[0, 0])
    assert nxt.eom == pytest.approx(step.eom[0, 0]) and nxt.line_drawn == pytest.approx(drawn)


def test_simulate_refuses_a_history_with_nan():
    """Un saldo NaN llegaría a `breach_prob() == 0` (sin riesgo): mejor que no pase la puerta."""
    with pytest.raises(ValueError):
        pj.simulate(_hist(eom=float("nan")), cfg=pj.SimConfig(n_paths=5, horizon=3))
    with pytest.raises(ValueError):
        h = _hist()
        h.dips[2] = np.nan
        pj.simulate(h, cfg=pj.SimConfig(n_paths=5, horizon=3))


def test_histories_drops_a_month_without_balance():
    """Sin saldo reconstruido no hay historia: la fila se cae y no contamina a las siguientes."""
    months = pd.period_range("2025-01", periods=6, freq="M").astype(str)
    f = pd.DataFrame({
        "company_id": "C",
        "month": months,
        "operating_inflows_eur": 900.0,
        "outflows_eur": 1_000.0,
        "eom_balance_eur": [5_000.0, 5_100.0, np.nan, 5_300.0, 5_400.0, 5_500.0],
        "min_balance_eur": [4_000.0, 4_100.0, 4_200.0, 4_300.0, 4_400.0, 4_500.0],
        "debt_service_6m_eur": np.nan,
    })
    hs = pj.histories(f)
    # 2025-01 no tiene Δeom; 2025-03 no tiene saldo; 2025-04 lo mediría contra un NaN
    assert sorted(m for _, m in hs) == ["2025-02", "2025-05", "2025-06"]
    for hist in hs.values():
        assert np.isfinite(hist.eom) and np.isfinite(hist.inflows).all()
