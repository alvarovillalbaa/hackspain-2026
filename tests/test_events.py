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


def _debt_fixture() -> tuple[pd.DataFrame, pd.DataFrame]:
    """D1 es el alta cara de febrero; X1–X3 son contratos preexistentes (2024) que llenan el pool."""
    debt = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-02-10")},
        {"product_id": "D2", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-03-10")},  # sin contrato
        {"product_id": "D3", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-04-10")},  # tipo normal
        {"product_id": "X1", "company_id": "C9", "type": "loan", "created_at": pd.Timestamp("2024-06-01")},
        {"product_id": "X2", "company_id": "C9", "type": "loan", "created_at": pd.Timestamp("2024-06-01")},
        {"product_id": "X3", "company_id": "C9", "type": "loan", "created_at": pd.Timestamp("2024-06-01")},
    ])
    schedule = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "annual_interest_rate_or_spread": 0.09},
        {"product_id": "D3", "company_id": "C1", "annual_interest_rate_or_spread": 0.03},
        {"product_id": "X1", "company_id": "C9", "annual_interest_rate_or_spread": 0.02},
        {"product_id": "X2", "company_id": "C9", "annual_interest_rate_or_spread": 0.04},
        {"product_id": "X3", "company_id": "C9", "annual_interest_rate_or_spread": 0.025},
    ])
    return debt, schedule


def test_expensive_new_debt_needs_a_contract_rate_above_the_portfolio_percentile():
    debt, schedule = _debt_fixture()
    out = events.build(_tables(debt=debt, schedule=schedule), _features())
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "expensive_new_debt"}]


def test_expensive_new_debt_pool_only_counts_contracts_existing_at_the_month():
    # un contrato carísimo dado de alta DESPUÉS no puede inflar el p75 de un alta anterior:
    # con toda la tabla el pool a 2026-02 sería [0.02×4, 0.06, 0.50] (p75 ≈ 0.28) y D1 no
    # saldría; contando solo lo existente a fin de febrero (p75 = 0.02) sí es «caro»
    debt, schedule = _debt_fixture()
    debt.loc[len(debt)] = {"product_id": "P5", "company_id": "C1", "type": "loan",
                           "created_at": pd.Timestamp("2026-07-10")}
    schedule.loc[len(schedule)] = {"product_id": "P5", "company_id": "C1",
                                   "annual_interest_rate_or_spread": 0.50}
    out = events.build(_tables(debt=debt, schedule=schedule), _features())
    # P5 también dispara en su alta (2026-07), pero ese mes está fuera de la rejilla
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "expensive_new_debt"}]


def test_expensive_new_debt_uses_the_frozen_threshold_from_the_model():
    # ingest/packs: el percentil de referencia viene congelado en el RulesModel y no hace
    # falta pool en el pack — con un solo contrato el evento sí dispara
    debt = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-02-10")},
    ])
    schedule = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "annual_interest_rate_or_spread": 0.09},
    ])
    cfg = events.EventsConfig(expensive_rate_threshold=0.05)
    out = events.build(_tables(debt=debt, schedule=schedule), _features(), cfg)
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "expensive_new_debt"}]
    assert events.build(_tables(debt=debt, schedule=schedule), _features(),
                        events.EventsConfig(expensive_rate_threshold=0.20)).empty


def test_rate_reference_is_the_portfolio_percentile_as_of_a_month():
    debt, schedule = _debt_fixture()
    tables = _tables(debt=debt, schedule=schedule)
    assert events.rate_reference(tables) == pytest.approx(0.04)  # p75 de toda la tabla
    assert events.rate_reference(tables, as_of="2026-02") == pytest.approx(0.0525)
    assert events.rate_reference(tables, as_of="2025-06") is None  # pool de 3 < mínimo
    assert events.rate_reference(_tables()) is None


def test_main_customer_lost_counts_invoice_history_before_the_grid():
    # A dejó de facturar justo antes de la rejilla: solo con la historia pre-rejilla llega a
    # los 6 meses recurrentes, y el evento sale a los `absence_months` del borde de la rejilla
    inv = pd.DataFrame(
        [_invoice("C1", "A", m, 6_000.0) for m in [str(p) for p in pd.period_range("2025-01", "2025-06", freq="M")]]
        + [_invoice("C1", "B", m, 4_000.0) for m in MONTHS]
    )
    grid = _features(months=[str(p) for p in pd.period_range("2025-07", "2026-06", freq="M")])
    out = events.build(_tables(invoices=inv), grid)
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2025-09", "kind": "main_customer_lost"}]


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


# --- robustez ante datos sucios y pools pequeños (revisión) ------------------------------------


def test_non_numeric_cells_do_not_crash_and_are_dropped():
    schedule = pd.DataFrame([
        {"product_id": "L1", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": "1.234,56", "annual_interest_rate_or_spread": 0.03},
        {"product_id": "L2", "company_id": "C1", "last_payment_date": pd.Timestamp("2026-05-15"),
         "outstanding_balance": 50_000.0, "annual_interest_rate_or_spread": 0.03},
    ])
    out = events.build(_tables(schedule=schedule), _features(outflows=10_000.0))
    assert out.to_dict("records") == [{"company_id": "C1", "month": "2026-02", "kind": "large_maturity"}]


def test_expensive_new_debt_needs_a_reference_pool():
    # con menos de `expensive_min_contracts` contratos con tipo no hay percentil de referencia:
    # en un pack de una sola empresa el evento no dispara aunque un contrato sea más caro que otro
    debt = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "type": "loan", "created_at": pd.Timestamp("2026-02-10")},
    ])
    schedule = pd.DataFrame([
        {"product_id": "D1", "company_id": "C1", "annual_interest_rate_or_spread": 0.09},
        {"product_id": "D2", "company_id": "C1", "annual_interest_rate_or_spread": 0.03},
        {"product_id": "D3", "company_id": "C1", "annual_interest_rate_or_spread": 0.04},
    ])
    assert events.build(_tables(debt=debt, schedule=schedule), _features()).empty


def test_uploaded_pack_gets_watch_from_its_own_invoices(tmp_path):
    from xray import features, prescore, score

    months = [str(p) for p in pd.period_range("2025-01", "2026-06", freq="M")]
    tx = "transaction_id,company_id,product_id,date,amount,category,status\n" + "".join(
        f"in{i},C1,CHK,{m}-15,20000,collection,booked\nout{i},C1,CHK,{m}-25,-15000,salary,booked\n"
        for i, m in enumerate(months)
    )
    header = ("operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,"
              "pending_amount,currency,accounting_currency,exchange_rate,status,counterparty_id")
    inv = [header]
    for i, m in enumerate(months):
        if m <= "2026-03":  # A factura hasta marzo de 2026 y desaparece: tres meses sin factura en junio
            inv.append(f"A{i},C1,invoice,{m}-05,{m}-25,{m}-25,6000,0,EUR,EUR,1,paid,CUST_A")
        inv.append(f"B{i},C1,invoice,{m}-05,{m}-25,{m}-25,4000,0,EUR,EUR,1,paid,CUST_B")
    files = {
        "companies.csv": "company_id,group_id,currency\nC1,G1,EUR\n",
        "banking_products.csv": "product_id,company_id,type,currency\nCHK,C1,checking,EUR\n",
        "balances.csv": "product_id,company_id,date,balance\nCHK,C1,2026-07-01,50000\n",
        "transactions.csv": tx,
        "invoices.csv": "\n".join(inv) + "\n",
    }
    for name, content in files.items():
        (tmp_path / name).write_text(content, encoding="utf-8")
    _, model = score.score_table(features.load_fixture())
    result = prescore.score_pack(tmp_path, model=model, peer_ref={})
    assert result is not None
    record = result["scores"][0]
    assert record["month"] == "2026-06"
    assert record["watch"] == "main_customer_lost"
    assert record["projection_6m"]["p10"] <= record["projection_6m"]["p50"] <= record["projection_6m"]["p90"]
