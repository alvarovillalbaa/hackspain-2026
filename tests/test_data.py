"""Tests del cargador. No dependen del dataset real: usan fixtures mínimas en tmp_path."""

import pandas as pd
import pytest

from xray import data


@pytest.fixture
def mini_dataset(tmp_path, monkeypatch):
    """Nueve CSV mínimos con las columnas que `data.load` toca."""
    monkeypatch.setenv("XRAY_DATA_DIR", str(tmp_path / "in"))
    monkeypatch.setenv("XRAY_ARTIFACTS_DIR", str(tmp_path / "art"))
    d = tmp_path / "in"
    d.mkdir()
    pd.DataFrame({"group_id": ["g1"], "erp": ["sap"], "n_companies_in_sample": [1]}).to_csv(
        d / "groups.csv", index=False
    )
    pd.DataFrame(
        {"company_id": ["c1"], "group_id": ["g1"], "country": ["ESPAÑA"], "currency": ["EUR"],
         "erp": ["sap"], "created_at": ["2024-01-01"]}
    ).to_csv(d / "companies.csv", index=False)
    for name in ("banking_products", "debt_products"):
        pd.DataFrame({"product_id": ["p1"], "company_id": ["c1"], "created_at": ["2024-01-01"]}).to_csv(
            d / f"{name}.csv", index=False
        )
    pd.DataFrame(
        {"product_id": ["p1"], "company_id": ["c1"], "next_payment_date": ["2026-10-01"],
         "last_payment_date": ["2030-10-01"]}
    ).to_csv(d / "debt_schedule_config.csv", index=False)
    pd.DataFrame(
        {"transaction_id": [1, 2], "company_id": ["c1", "c1"], "product_id": ["p1", "p1"],
         "date": ["2025-01-15", "2025-02-15"], "value_date": ["2025-01-15", "2025-02-15"],
         "amount": [100.0, -40.0]}
    ).to_csv(d / "transactions.csv", index=False)
    pd.DataFrame(
        {"operation_id": [1, 2, 3], "company_id": ["c1"] * 3,
         "issuance_date": ["2025-01-01", "2025-01-01", "2025-01-01"],
         "due_date": ["2025-02-01", "2025-02-01", "2095-04-02"],
         "payment_date": ["2025-02-01", "2025-01-20", "2095-04-02"],
         "amount": [-500.0, 300.0, -10.0], "status": ["overdue", "paid", "overdue"]}
    ).to_csv(d / "invoices.csv", index=False)
    pd.DataFrame({"product_id": ["p1"], "company_id": ["c1"], "date": ["2026-09-01"], "balance": [1.0]}).to_csv(
        d / "balances.csv", index=False
    )
    return d


def test_missing_dir_gives_clear_error(tmp_path, monkeypatch):
    monkeypatch.setenv("XRAY_DATA_DIR", str(tmp_path / "nope"))
    monkeypatch.setenv("XRAY_ARTIFACTS_DIR", str(tmp_path / "art"))  # sin caché previa
    with pytest.raises(FileNotFoundError, match="XRAY_DATA_DIR"):
        data.load("groups")


def test_unknown_table():
    with pytest.raises(KeyError):
        data.load("nope")


def test_invoice_direction_from_sign(mini_dataset):
    inv = data.load("invoices")
    assert list(inv["direction"]) == ["received", "issued", "received"]


def test_out_of_range_dates_become_nat(mini_dataset):
    inv = data.load("invoices")
    assert inv["due_date"].isna().sum() == 1
    assert inv["payment_date"].isna().sum() == 1


def test_country_normalised_and_month_added(mini_dataset):
    t = data.load()
    assert t["companies"]["country"].iloc[0] == "ES"
    assert str(t["transactions"]["month"].iloc[0]) == "2025-01"


def test_parquet_cache_roundtrip(mini_dataset, tmp_path):
    first = data.load("transactions")
    assert (tmp_path / "art" / "raw" / "transactions.parquet").exists()
    (mini_dataset / "transactions.csv").unlink()  # si vuelve a leer el CSV, falla
    second = data.load("transactions")
    pd.testing.assert_frame_equal(first, second)
