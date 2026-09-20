import pandas as pd
import pytest

from xray import adoption


def _tx(rows):
    cols = ["company_id", "product_id", "date", "amount", "category", "description"]
    df = pd.DataFrame(rows, columns=cols)
    df["date"] = pd.to_datetime(df["date"])
    df["transaction_id"] = [f"T{i}" for i in range(len(df))]
    return df


@pytest.fixture
def frames():
    tx = _tx([
        ("C1", "P1", "2025-01-10", -500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C1", "P1", "2025-02-10", -500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C1", "P1", "2025-03-10", -500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C1", "P1", "2025-04-10", -1500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C1", "P1", "2025-05-10", -1500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C1", "P1", "2025-06-10", -1500, "debt_repayment", "CUOTA PRESTAMO"),
        ("C2", "P2", "2025-03-05", 2000, "collection", "ANTICIPO FACTURA 12"),
        ("C2", "P2", "2025-02-06", 300, "collection", "DEVOLUCION ANTICIPO"),
        ("C2", "P2", "2025-04-05", 3000, "collection", "OPERACION DE FACTORING"),
        ("C3", "P3", "2025-02-01", 1000, "-", "DISPOSICION CREDITO"),
        ("C3", "P4", "2025-05-01", -200, "fee", "COMISION"),
    ])
    products = pd.DataFrame({
        "product_id": ["P1", "P2", "P3", "P4"],
        "company_id": ["C1", "C2", "C3", "C3"],
        "type": ["checking", "checking", "checking", "lineofcredit"],
    })
    debt = pd.DataFrame({"product_id": ["D1"], "company_id": ["C3"], "type": ["lineofcredit"],
                         "created_at": pd.to_datetime(["2025-05-03"]), "granted": [-50000.0]})
    months = pd.period_range("2024-10", "2025-09", freq="M").astype(str)
    pairs = [(c, m) for c in ["C1", "C2", "C3"] for m in months]
    feats = pd.DataFrame(pairs, columns=["company_id", "month"])
    return tx, debt, products, feats


def _one(ev, product, source, cid):
    sel = ev[(ev["product"] == product) & (ev["source"] == source) & (ev["company_id"] == cid)]
    assert len(sel) >= 1, (product, source, cid)
    return sel.sort_values("month").iloc[0]


def test_installment_first_month_and_amount(frames):
    ev = adoption.adoption_events(*frames)
    r = _one(ev, "loan", "installment", "C1")
    assert r["month"] == "2025-01" and r["amount_eur"] == 500
    assert r["pre_months"] == 3 and r["post_months"] == 8


def test_step_up_detected(frames):
    ev = adoption.adoption_events(*frames)
    r = _one(ev, "loan", "step_up", "C1")
    assert r["month"] == "2025-04" and r["amount_eur"] == pytest.approx(1000)


def test_description_rules(frames):
    ev = adoption.adoption_events(*frames)
    # la devolución de febrero no cuenta
    assert _one(ev, "anticipo", "description", "C2")["month"] == "2025-03"
    assert _one(ev, "factoring", "description", "C2")["amount_eur"] == 3000
    assert _one(ev, "disposicion", "description", "C3")["month"] == "2025-02"


def test_line_tx_and_created_at(frames):
    ev = adoption.adoption_events(*frames)
    assert _one(ev, "line", "line_tx", "C3")["month"] == "2025-05"
    r = _one(ev, "line", "created_at", "C3")
    assert r["month"] == "2025-05" and r["amount_eur"] == 50000


def test_columns_and_months_inside_history(frames):
    ev = adoption.adoption_events(*frames)
    assert list(ev.columns) == adoption.COLUMNS
    assert set(ev["product"]) <= set(adoption.PRODUCTS)
    assert set(ev["source"]) <= set(adoption.SOURCES)
    assert ev["month"].str.fullmatch(r"\d{4}-\d{2}").all()


def test_clean_events_filters_and_first_only(frames):
    ev = adoption.adoption_events(*frames)
    # la ventana del fixture (2024-10..2025-09) deja 6 meses antes y 5 después de 2025-04
    c = adoption.clean_events(ev, product="loan", source="step_up", min_pre=3, min_post=5)
    assert len(c) == 1 and c.iloc[0]["month"] == "2025-04"
    wide = adoption.clean_events(ev, min_pre=6, min_post=6)
    assert wide.query("product == 'loan' and source == 'installment'").empty


def test_monthly_debt_service(frames):
    ds = adoption.monthly_debt_service(frames[0])
    assert list(ds.columns) == ["company_id", "month", "debt_service_eur"]
    assert ds.set_index(["company_id", "month"]).loc[("C1", "2025-04"), "debt_service_eur"] == 1500
