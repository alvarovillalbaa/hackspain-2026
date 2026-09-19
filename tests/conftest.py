from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest


@pytest.fixture
def mini_cache(tmp_path: Path) -> Path:
    frames = {
        "companies": pd.DataFrame(
            [
                {
                    "company_id": "C1",
                    "group_id": "G1",
                    "currency": "EUR",
                    "erp": "sap",
                    "created_at": "2023-01-01",
                },
                {
                    "company_id": "C2",
                    "group_id": "G1",
                    "currency": "EUR",
                    "erp": None,
                    "created_at": "2023-01-01",
                },
            ]
        ),
        "banking_products": pd.DataFrame(
            [
                {
                    "product_id": "B1",
                    "company_id": "C1",
                    "type": "checking",
                    "currency": "EUR",
                    "created_at": "2023-01-01",
                },
                {
                    "product_id": "B2",
                    "company_id": "C2",
                    "type": "checking",
                    "currency": "EUR",
                    "created_at": "2023-01-01",
                },
            ]
        ),
        "debt_products": pd.DataFrame(
            [
                {
                    "product_id": "D1",
                    "company_id": "C1",
                    "type": "loan",
                    "currency": "EUR",
                    "created_at": "2024-01-01",
                    "outstanding": -5000,
                }
            ]
        ),
        "balances": pd.DataFrame(
            [
                {"product_id": "B1", "company_id": "C1", "date": "2024-06-30", "balance": 1000.0},
                {"product_id": "B2", "company_id": "C2", "date": "2024-06-30", "balance": 500.0},
            ]
        ),
        "transactions": pd.DataFrame(
            [
                {
                    "transaction_id": "T1",
                    "company_id": "C1",
                    "product_id": "B1",
                    "date": "2024-07-02",
                    "value_date": "2024-07-02",
                    "amount": 500.0,
                    "amount_accounting": 500.0,
                    "exchange_rate": 1.0,
                    "status": "booked",
                    "category": "collection",
                    "counterparty_id": "CUSTOMER",
                },
                {
                    "transaction_id": "T2",
                    "company_id": "C1",
                    "product_id": "B1",
                    "date": "2024-07-10",
                    "value_date": "2024-07-10",
                    "amount": -300.0,
                    "amount_accounting": -300.0,
                    "exchange_rate": 1.0,
                    "status": "booked",
                    "category": "payment",
                    "counterparty_id": "SUPPLIER",
                },
                {
                    "transaction_id": "T3",
                    "company_id": "C1",
                    "product_id": "B1",
                    "date": "2024-08-10",
                    "value_date": "2024-08-10",
                    "amount": 900.0,
                    "amount_accounting": 900.0,
                    "exchange_rate": 1.0,
                    "status": "booked",
                    "category": "collection",
                    "counterparty_id": "FUTURE",
                },
                {
                    "transaction_id": "T4",
                    "company_id": "C2",
                    "product_id": "B2",
                    "date": "2024-07-12",
                    "value_date": "2024-07-12",
                    "amount": -100.0,
                    "amount_accounting": -100.0,
                    "exchange_rate": 1.0,
                    "status": "booked",
                    "category": "utility",
                    "counterparty_id": "POWER",
                },
            ]
        ),
        "invoices": pd.DataFrame(
            [
                {
                    "operation_id": "I1",
                    "company_id": "C1",
                    "issuance_date": "2024-06-01",
                    "due_date": "2024-06-30",
                    "payment_date": "2024-08-05",
                    "amount": 200.0,
                    "amount_accounting": 200.0,
                    "pending_amount": 0.0,
                    "currency": "EUR",
                    "accounting_currency": "EUR",
                    "exchange_rate": 1.0,
                    "status": "paid",
                    "counterparty_id": "CUSTOMER",
                    "date_plausible": True,
                },
                {
                    "operation_id": "I2",
                    "company_id": "C1",
                    "issuance_date": "2024-07-01",
                    "due_date": "2024-07-15",
                    "payment_date": None,
                    "amount": -100.0,
                    "amount_accounting": -100.0,
                    "pending_amount": -100.0,
                    "currency": "EUR",
                    "accounting_currency": "EUR",
                    "exchange_rate": 1.0,
                    "status": "overdue",
                    "counterparty_id": "SUPPLIER",
                    "date_plausible": True,
                },
            ]
        ),
        "debt_schedule_config": pd.DataFrame(
            columns=["product_id", "company_id", "next_payment_date", "last_payment_date"]
        ),
    }
    date_columns = {
        "created_at",
        "date",
        "value_date",
        "issuance_date",
        "due_date",
        "payment_date",
        "next_payment_date",
        "last_payment_date",
    }
    for name, frame in frames.items():
        for column in date_columns.intersection(frame.columns):
            frame[column] = pd.to_datetime(frame[column])
        frame.to_parquet(tmp_path / f"{name}.parquet", index=False)
    return tmp_path
