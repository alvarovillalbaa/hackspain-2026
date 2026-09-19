"""Tests de xray.unify: pivot tema → tablas canónicas + resumen de cobertura."""

from __future__ import annotations

import pandas as pd

from xray.unify import UploadedFile, unify


def _csv(headers: list[str], rows: list[list]) -> bytes:
    lines = [",".join(headers)]
    for r in rows:
        lines.append(",".join("" if v is None else str(v) for v in r))
    return ("\n".join(lines) + "\n").encode("utf-8")


def test_unify_concatenates_same_topic_and_applies_mapping():
    companies = _csv(
        ["company_id", "group_id", "currency"],
        [["A", "G1", "EUR"], ["B", "G1", "EUR"]],
    )
    # Two transaction files with a renamed amount column
    tx1 = _csv(
        ["transaction_id", "company_id", "product_id", "date", "importe", "category", "status"],
        [["t1", "A", "CHK_A", "2026-07-01", "100", "collection", "booked"]],
    )
    tx2 = _csv(
        ["transaction_id", "company_id", "product_id", "date", "importe", "category", "status"],
        [["t2", "A", "CHK_A", "2026-08-01", "-50", "supplier", "booked"],
         ["t3", "B", "CHK_B", "2026-08-01", "20", "collection", "booked"]],
    )
    bank = _csv(
        ["product_id", "company_id", "type"],
        [["CHK_A", "A", "checking"], ["CHK_B", "B", "checking"]],
    )
    bal = _csv(
        ["product_id", "company_id", "date", "balance"],
        [["CHK_A", "A", "2026-09-01", "1000"], ["CHK_B", "B", "2026-09-01", "50"]],
    )
    mapping_tx = {
        "transaction_id": "transaction_id",
        "company_id": "company_id",
        "product_id": "product_id",
        "date": "date",
        "importe": "amount",
        "category": "category",
        "status": "status",
    }
    tables, summary = unify([
        UploadedFile("companies", "companies.csv", companies, {}),
        UploadedFile("transactions", "tx1.csv", tx1, mapping_tx),
        UploadedFile("transactions", "tx2.csv", tx2, mapping_tx),
        UploadedFile("banking_products", "bank.csv", bank, {}),
        UploadedFile("balances", "bal.csv", bal, {}),
    ])
    assert len(tables["transactions"]) == 3
    assert "amount" in tables["transactions"].columns
    assert "importe" not in tables["transactions"].columns
    assert set(c.company_id for c in summary.companies) == {"A", "B"}
    assert all(c.scorable for c in summary.companies)
    assert summary.topics_present == ["companies", "banking_products", "transactions", "balances"]
    a = next(c for c in summary.companies if c.company_id == "A")
    assert a.row_counts["transactions"] == 2
    assert a.months == ["2026-07", "2026-08"]


def test_unify_marks_company_without_checking_balance_unscorable():
    companies = _csv(["company_id", "group_id"], [["C", "G2"]])
    bank = _csv(["product_id", "company_id", "type"], [["SAV_C", "C", "saving"]])
    bal = _csv(
        ["product_id", "company_id", "date", "balance"],
        [["SAV_C", "C", "2026-09-01", "5000"]],
    )
    tx = _csv(
        ["transaction_id", "company_id", "product_id", "date", "amount", "category", "status"],
        [["t1", "C", "SAV_C", "2026-08-01", "10", "collection", "booked"]],
    )
    _, summary = unify([
        UploadedFile("companies", "c.csv", companies, {}),
        UploadedFile("banking_products", "b.csv", bank, {}),
        UploadedFile("balances", "bal.csv", bal, {}),
        UploadedFile("transactions", "tx.csv", tx, {}),
    ])
    c = summary.companies[0]
    assert c.scorable is False
    assert "cuenta corriente" in (c.drop_reason or "")


def test_unify_infers_companies_from_transactions_when_missing():
    bank = _csv(["product_id", "company_id", "type"], [["CHK_A", "A", "checking"]])
    bal = _csv(
        ["product_id", "company_id", "date", "balance"],
        [["CHK_A", "A", "2026-09-01", "100"]],
    )
    tx = _csv(
        ["transaction_id", "company_id", "product_id", "date", "amount", "category", "status"],
        [["t1", "A", "CHK_A", "2026-08-01", "10", "collection", "booked"]],
    )
    tables, summary = unify([
        UploadedFile("banking_products", "b.csv", bank, {}),
        UploadedFile("balances", "bal.csv", bal, {}),
        UploadedFile("transactions", "tx.csv", tx, {}),
    ])
    assert list(tables["companies"]["company_id"]) == ["A"]
    assert any("inferidas" in w for w in summary.warnings)
    assert summary.companies[0].scorable is True


def test_unify_remaps_upload_onto_target_company():
    companies = _csv(
        ["company_id", "group_id", "currency"],
        [["A", "G1", "EUR"], ["B", "G1", "EUR"]],
    )
    bank = _csv(
        ["product_id", "company_id", "type"],
        [["CHK_A", "A", "checking"], ["CHK_B", "B", "checking"]],
    )
    bal = _csv(
        ["product_id", "company_id", "date", "balance"],
        [["CHK_A", "A", "2026-09-01", "1000"], ["CHK_B", "B", "2026-09-01", "50"]],
    )
    tx = _csv(
        ["transaction_id", "company_id", "product_id", "date", "amount", "category", "status"],
        [["t1", "A", "CHK_A", "2026-08-01", "10", "collection", "booked"],
         ["t2", "B", "CHK_B", "2026-08-01", "20", "collection", "booked"]],
    )
    tables, summary = unify(
        [
            UploadedFile("companies", "c.csv", companies, {}),
            UploadedFile("banking_products", "b.csv", bank, {}),
            UploadedFile("balances", "bal.csv", bal, {}),
            UploadedFile("transactions", "tx.csv", tx, {}),
        ],
        target_company_id="COMP_0001",
        target_group_id="GROUP_KEEP",
        target_country="ES",
        target_currency="EUR",
    )
    assert list(tables["companies"]["company_id"]) == ["COMP_0001"]
    assert tables["companies"]["group_id"].iloc[0] == "GROUP_KEEP"
    assert set(tables["transactions"]["company_id"]) == {"COMP_0001"}
    assert set(tables["banking_products"]["company_id"]) == {"COMP_0001"}
    assert len(summary.companies) == 1
    assert summary.companies[0].company_id == "COMP_0001"
    assert summary.companies[0].scorable is True
    assert any("fusionadas" in w for w in summary.warnings)


def test_unify_builds_group_summary():
    companies = _csv(
        ["company_id", "group_id"],
        [["A", "G1"], ["B", "G1"], ["C", "G2"]],
    )
    bank = _csv(
        ["product_id", "company_id", "type"],
        [["CHK_A", "A", "checking"], ["CHK_B", "B", "checking"], ["CHK_C", "C", "checking"]],
    )
    bal = _csv(
        ["product_id", "company_id", "date", "balance"],
        [["CHK_A", "A", "2026-09-01", "1"], ["CHK_B", "B", "2026-09-01", "1"],
         ["CHK_C", "C", "2026-09-01", "1"]],
    )
    tx = _csv(
        ["transaction_id", "company_id", "product_id", "date", "amount", "category", "status"],
        [["t1", "A", "CHK_A", "2026-08-01", "1", "collection", "booked"],
         ["t2", "B", "CHK_B", "2026-08-01", "1", "collection", "booked"],
         ["t3", "C", "CHK_C", "2026-08-01", "1", "collection", "booked"]],
    )
    _, summary = unify([
        UploadedFile("companies", "c.csv", companies, {}),
        UploadedFile("banking_products", "b.csv", bank, {}),
        UploadedFile("balances", "bal.csv", bal, {}),
        UploadedFile("transactions", "tx.csv", tx, {}),
    ])
    by_g = {g["group_id"]: g for g in summary.groups}
    assert by_g["G1"]["n_companies"] == 2 and by_g["G1"]["n_scorable"] == 2
    assert by_g["G2"]["n_companies"] == 1
