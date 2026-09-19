"""Source validation, normalization, and the reproducible Parquet cache."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

TABLES = (
    "groups",
    "companies",
    "banking_products",
    "debt_products",
    "debt_schedule_config",
    "transactions",
    "invoices",
    "balances",
)

DATE_COLUMNS = {
    "companies": ("created_at",),
    "banking_products": ("created_at",),
    "debt_products": ("created_at",),
    "debt_schedule_config": ("next_payment_date", "last_payment_date"),
    "transactions": ("date", "value_date"),
    "invoices": ("issuance_date", "due_date", "payment_date"),
    "balances": ("date",),
}

REQUIRED_COLUMNS = {
    "groups": {"group_id"},
    "companies": {"company_id", "group_id", "currency", "created_at"},
    "banking_products": {"product_id", "company_id", "type", "currency", "created_at"},
    "debt_products": {"product_id", "company_id", "type", "currency", "created_at"},
    "debt_schedule_config": {"product_id", "company_id", "next_payment_date"},
    "transactions": {
        "transaction_id",
        "company_id",
        "product_id",
        "date",
        "amount",
        "exchange_rate",
        "status",
        "category",
    },
    "invoices": {
        "operation_id",
        "company_id",
        "issuance_date",
        "due_date",
        "payment_date",
        "amount",
        "pending_amount",
        "currency",
        "accounting_currency",
        "exchange_rate",
    },
    "balances": {"product_id", "company_id", "date", "balance"},
}

COUNTRY_ALIASES = {
    "ESPAÑA": "ES",
    "ESPANA": "ES",
    "ESPANYA": "ES",
    "SPAIN": "ES",
    "PORTUGAL": "PT",
    "ITALIA": "IT",
}

PRODUCT_TYPE_ALIASES = {
    "expensesplatform": "expenses_platform",
    "lineofcredit": "line_of_credit",
    "lineofcomex": "line_of_comex",
}


@dataclass
class TableQuality:
    rows: int = 0
    duplicate_keys: int = 0
    missing_identifiers: int = 0
    invalid_dates: int = 0
    invalid_exchange_rates: int = 0
    ownership_errors: int = 0
    quarantined_rows: int = 0
    notes: list[str] = field(default_factory=list)


@dataclass
class DataQualityReport:
    generated_at: str
    source_directory: str
    cache_directory: str
    tables: dict[str, TableQuality]
    exchange_rate_convention: str = "accounting_amount = source_amount / exchange_rate"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _read_csv(path: Path, table: str) -> pd.DataFrame:
    if not path.exists():
        if table == "debt_schedule_config":
            return pd.DataFrame(columns=sorted(REQUIRED_COLUMNS[table]))
        raise FileNotFoundError(f"Missing source table: {path}")
    frame = pd.read_csv(path, low_memory=False)
    missing = REQUIRED_COLUMNS[table] - set(frame.columns)
    if missing:
        raise ValueError(f"{table}.csv is missing columns: {sorted(missing)}")
    return frame


def _normalise_text(frame: pd.DataFrame, table: str) -> None:
    id_columns = [c for c in frame if c.endswith("_id")]
    for column in id_columns:
        frame[column] = frame[column].astype("string").str.strip()
    for column in ("currency", "accounting_currency"):
        if column in frame:
            frame[column] = frame[column].astype("string").str.strip().str.upper()
    if "country" in frame:
        country = frame["country"].astype("string").str.strip().str.upper()
        frame["country"] = country.replace(COUNTRY_ALIASES)
    if "type" in frame and table in {"banking_products", "debt_products"}:
        product_type = frame["type"].astype("string").str.strip().str.lower()
        frame["type"] = product_type.replace(PRODUCT_TYPE_ALIASES)
    if "category" in frame:
        frame["category"] = frame["category"].astype("string").str.strip().str.lower()
    if "status" in frame:
        frame["status"] = frame["status"].astype("string").str.strip().str.lower()


def _normalise_dates(frame: pd.DataFrame, table: str, quality: TableQuality) -> None:
    for column in DATE_COLUMNS.get(table, ()):
        if column not in frame:
            continue
        raw_present = frame[column].notna()
        parsed = pd.to_datetime(frame[column], errors="coerce", utc=True).dt.tz_localize(None)
        quality.invalid_dates += int((raw_present & parsed.isna()).sum())
        frame[column] = parsed


def _convert_amounts(frame: pd.DataFrame, table: str, quality: TableQuality) -> None:
    if "exchange_rate" not in frame:
        return
    rate = pd.to_numeric(frame["exchange_rate"], errors="coerce")
    invalid = rate.isna() | ~np.isfinite(rate) | rate.le(0)
    quality.invalid_exchange_rates = int(invalid.sum())
    frame["exchange_rate_valid"] = ~invalid
    if table == "transactions":
        # A transaction is denominated in its product currency. The supplied rate is
        # source units per company accounting unit (for example USD/EUR ~= 1.16).
        frame["amount_accounting"] = pd.to_numeric(frame["amount"], errors="coerce") / rate
        frame.loc[invalid, "amount_accounting"] = np.nan
    elif table == "invoices":
        amount = pd.to_numeric(frame["amount"], errors="coerce")
        pending = pd.to_numeric(frame["pending_amount"], errors="coerce")
        same_currency = frame["currency"].eq(frame["accounting_currency"])
        effective_rate = rate.where(~same_currency, 1.0)
        frame["amount_accounting"] = amount / effective_rate
        frame["pending_amount_accounting"] = pending / effective_rate
        frame.loc[invalid & ~same_currency, ["amount_accounting", "pending_amount_accounting"]] = (
            np.nan
        )


def build_cache(source_dir: str | Path, cache_dir: str | Path) -> DataQualityReport:
    """Validate all source tables and write normalized Parquet files atomically."""

    source = Path(source_dir).resolve()
    cache = Path(cache_dir).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    frames: dict[str, pd.DataFrame] = {}
    qualities: dict[str, TableQuality] = {}

    for table in TABLES:
        frame = _read_csv(source / f"{table}.csv", table)
        quality = TableQuality(rows=len(frame))
        _normalise_text(frame, table)
        _normalise_dates(frame, table, quality)
        _convert_amounts(frame, table, quality)
        key = {
            "groups": "group_id",
            "companies": "company_id",
            "banking_products": "product_id",
            "debt_products": "product_id",
            "debt_schedule_config": "product_id",
            "transactions": "transaction_id",
            "invoices": "operation_id",
            "balances": "product_id",
        }[table]
        quality.duplicate_keys = int(frame.duplicated(key, keep=False).sum())
        quality.missing_identifiers = int(frame[key].isna().sum())
        frames[table] = frame
        qualities[table] = quality

    company_ids = set(frames["companies"]["company_id"].dropna())
    product_owners = pd.concat(
        [
            frames["banking_products"][["product_id", "company_id"]],
            frames["debt_products"][["product_id", "company_id"]],
        ],
        ignore_index=True,
    ).drop_duplicates("product_id")
    owner_map = product_owners.set_index("product_id")["company_id"]

    for table in ("banking_products", "debt_products", "transactions", "invoices", "balances"):
        frame = frames[table]
        qualities[table].ownership_errors += int((~frame["company_id"].isin(company_ids)).sum())
    for table in ("transactions", "balances"):
        frame = frames[table]
        expected = frame["product_id"].map(owner_map)
        qualities[table].ownership_errors += int(
            (expected.notna() & expected.ne(frame["company_id"])).sum()
        )

    tx = frames["transactions"]
    implausible_value_date = tx["value_date"].notna() & (
        (tx["value_date"] - tx["date"]).abs() > pd.Timedelta(days=90)
    )
    tx["value_date_plausible"] = ~implausible_value_date
    tx.loc[implausible_value_date, "value_date"] = pd.NaT
    qualities["transactions"].quarantined_rows += int(implausible_value_date.sum())

    invoices = frames["invoices"]
    implausible_invoice = (
        invoices["issuance_date"].isna()
        | (
            invoices["due_date"].notna()
            & (invoices["due_date"] < invoices["issuance_date"] - pd.Timedelta(days=31))
        )
        | (
            invoices["payment_date"].notna()
            & (invoices["payment_date"] < invoices["issuance_date"] - pd.Timedelta(days=31))
        )
    )
    invoices["date_plausible"] = ~implausible_invoice
    qualities["invoices"].quarantined_rows += int(implausible_invoice.sum())

    # Duplicate primary keys are unsafe: keep the first deterministically and report every row.
    for table, frame in frames.items():
        key = {
            "groups": "group_id",
            "companies": "company_id",
            "banking_products": "product_id",
            "debt_products": "product_id",
            "debt_schedule_config": "product_id",
            "transactions": "transaction_id",
            "invoices": "operation_id",
            "balances": "product_id",
        }[table]
        frame = frame.drop_duplicates(key, keep="first")
        target = cache / f"{table}.parquet"
        temporary = cache / f".{table}.parquet.tmp"
        frame.to_parquet(temporary, index=False)
        temporary.replace(target)

    report = DataQualityReport(
        generated_at=pd.Timestamp.now(tz="UTC").isoformat(),
        source_directory=str(source),
        cache_directory=str(cache),
        tables=qualities,
    )
    report_path = cache / "data_quality.json"
    report_path.write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the normalized X-Ray Parquet cache")
    parser.add_argument("--source", default="dataset", help="directory containing source CSV files")
    parser.add_argument("--output", default="artifacts/cache", help="Parquet cache directory")
    args = parser.parse_args(argv)
    report = build_cache(args.source, args.output)
    print(json.dumps(report.to_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
