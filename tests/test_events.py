"""Tests de xray.events al seam: tablas crudas pequeñas → eventos de watch esperados (#31)."""

from __future__ import annotations

import pandas as pd
import pytest

from xray import events, rules

MONTHS = [str(p) for p in pd.period_range("2025-01", "2026-06", freq="M")]


def _features(company: str = "C1", outflows: float = 10_000.0, months: list[str] = MONTHS) -> pd.DataFrame:
    return pd.DataFrame({"company_id": company, "month": months, "outflows_eur": outflows})


def _invoice(cid: str, cp: str, month: str, amount: float) -> dict:
    return {
        "operation_id": f"{cid}-{cp}-{month}", "company_id": cid, "document_type": "invoice", "status": "paid",
        "issuance_date": pd.Timestamp(f"{month}-05"), "due_date": pd.Timestamp(f"{month}-25"),
        "payment_date": pd.Timestamp(f"{month}-25"), "amount": amount, "counterparty_id": cp,
    }


def _tables(invoices: pd.DataFrame | None = None, debt: pd.DataFrame | None = None,
            schedule: pd.DataFrame | None = None) -> dict[str, pd.DataFrame]:
    return {
        "invoices": invoices if invoices is not None else pd.DataFrame(),
        "debt_products": debt if debt is not None else pd.DataFrame(),
        "debt_schedule_config": schedule if schedule is not None else pd.DataFrame(),
    }


def _lost_customer_invoices() -> pd.DataFrame:
    rows = []
    for m in [str(p) for p in pd.period_range("2025-01", "2025-12", freq="M")]:
        rows.append(_invoice("C1", "A", m, 6_000.0))  # A: recurrente, ~55 % de la facturación
        rows.append(_invoice("C1", "B", m, 4_000.0))
    for m in [str(p) for p in pd.period_range("2026-01", "2026-06", freq="M")]:
        rows.append(_invoice("C1", "B", m, 4_000.0))  # A desaparece desde 2026-01
    return pd.DataFrame(rows)


# --- main_customer_lost ------------------------------------------------------------------


def test_main_customer_lost_fires_once_when_a_recurring_big_customer_stops_invoicing():
    out = events.build(_tables(invoices=_lost_customer_invoices()), _features())
    # 2026-03 es el primer mes con tres meses sin factura de A; el episodio no se repite después
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-03", "kind": "main_customer_lost"}]


def test_main_customer_lost_ignores_small_or_non_recurring_customers_and_needs_invoices():
    rows = []
    for m in [str(p) for p in pd.period_range("2025-01", "2025-12", freq="M")]:
        rows.append(_invoice("C1", "A", m, 9_000.0))
        rows.append(_invoice("C1", "small", m, 1_000.0))  # ~5 %: por debajo de min_share
    rows.append(_invoice("C1", "once", "2025-06", 50_000.0))  # un solo mes: no recurrente
    for m in [str(p) for p in pd.period_range("2026-01", "2026-06", freq="M")]:
        rows.append(_invoice("C1", "A", m, 9_000.0))
    assert events.build(_tables(invoices=pd.DataFrame(rows)), _features()).empty
    assert events.build(_tables(), _features()).empty
    assert list(events.build(_tables(), _features()).columns) == events.COLUMNS


# --- large_maturity ----------------------------------------------------------------------


def test_large_maturity_fires_in_the_first_month_within_90_days_only_when_the_balance_is_big():
    schedule = pd.DataFrame([
        {"product_id": "L1", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": 50_000.0, "annual_interest_rate_or_spread": 0.03},
        {"product_id": "L2", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": 2_000.0, "annual_interest_rate_or_spread": 0.03},  # menos de un mes de cargos
    ])
    out = events.build(_tables(schedule=schedule), _features(outflows=10_000.0))
    # fin de 2026-01 → 104 días (fuera); fin de 2026-02 → 76 días (dentro): primer mes en ventana
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "large_maturity"}]


# --- expensive_new_debt ------------------------------------------------------------------


def test_expensive_new_debt_needs_a_contract_rate_above_the_portfolio_percentile():
    debt = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-02-10")},
        {"product_id": "D2", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-03-10")},  # sin contrato
        {"product_id": "D3", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-04-10")},  # tipo normal
    ])
    schedule = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "annual_interest_rate_or_spread": 0.09},
        {"product_id": "D3", "company_id": "C1", "annual_interest_rate_or_spread": 0.03},
        {"product_id": "X1", "company_id": "C9", "annual_interest_rate_or_spread": 0.02},
        {"product_id": "X2", "company_id": "C9", "annual_interest_rate_or_spread": 0.04},
    ])
    out = events.build(_tables(debt=debt, schedule=schedule), _features())
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "expensive_new_debt"}]


# --- determinismo, sin mirar el futuro, rejilla ----------------------------------------------


def test_events_are_deterministic_and_never_look_ahead():
    inv = _lost_customer_invoices()
    full = events.build(_tables(invoices=inv), _features())
    truncated = events.build(
        _tables(invoices=inv[inv["issuance_date"] <= "2026-03-31"]),
        _features(months=[m for m in MONTHS if m <= "2026-03"]),
    )
    pd.testing.assert_frame_equal(full[full["month"] <= "2026-03"].reset_index(drop=True), truncated)
    pd.testing.assert_frame_equal(events.build(_tables(invoices=inv.sample(frac=1, random_state=1)), _features()), full)
    # fuera de la rejilla de features no hay eventos
    assert events.build(_tables(invoices=inv), _features(months=[m for m in MONTHS if m <= "2026-02"])).empty


def test_events_feed_rules_watch_for_three_months():
    ev = events.build(_tables(invoices=_lost_customer_invoices()), _features())
    indexed = pd.DataFrame({"company_id": "C1", "month": MONTHS, "n_red": 0})
    watch = rules.watch(indexed, ev, rules.RulesConfig())["watch"].tolist()
    i = MONTHS.index("2026-03")
    assert watch[i:i + 3] == ["main_customer_lost"] * 3 and watch[i + 3] is None


def test_thresholds_are_configurable():
    inv = _lost_customer_invoices()
    strict = events.EventsConfig(min_share=0.90)
    assert events.build(_tables(invoices=inv), _features(), strict).empty
