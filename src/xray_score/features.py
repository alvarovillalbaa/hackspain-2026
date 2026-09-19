from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

import polars as pl

from .config import (
    LIQUID_BANKING_PRODUCT_TYPES,
    MANDATORY_OUTFLOW_CATEGORIES,
    OPERATING_INFLOW_EXCLUSIONS,
    OPERATING_OUTFLOW_EXCLUSIONS,
)


def _timestamp(column: str) -> pl.Expr:
    return pl.col(column).str.to_datetime(strict=False)


def _month(column: str) -> pl.Expr:
    return _timestamp(column).dt.truncate("1mo").cast(pl.Date)


def _month_sequence(start: date, end_exclusive: date) -> list[date]:
    months: list[date] = []
    current = start.replace(day=1)
    while current < end_exclusive:
        months.append(current)
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)
    return months


def _rolling_sum(column: str, months: int) -> pl.Expr:
    return (
        pl.col(column)
        .rolling_sum(window_size=months, min_samples=1)
        .over("company_id")
    )


def _rolling_mean(column: str, months: int) -> pl.Expr:
    return (
        pl.col(column)
        .rolling_mean(window_size=months, min_samples=1)
        .over("company_id")
    )


def _rolling_median(column: str, months: int) -> pl.Expr:
    return (
        pl.col(column)
        .rolling_median(window_size=months, min_samples=1)
        .over("company_id")
    )


def _load_companies(data_dir: Path) -> pl.DataFrame:
    return pl.read_csv(
        data_dir / "companies.csv",
        schema_overrides={"created_at": pl.String},
    ).select("company_id", "group_id", "country", "currency", "erp", "created_at")


def _analysis_dates(data_dir: Path) -> tuple[date, date]:
    transaction_dates = (
        pl.scan_csv(data_dir / "transactions.csv", schema_overrides={"date": pl.String})
        .select(_timestamp("date").min().alias("start"))
        .collect()
    )
    balance_dates = (
        pl.scan_csv(data_dir / "balances.csv", schema_overrides={"date": pl.String})
        .select(_timestamp("date").min().alias("as_of"))
        .collect()
    )
    start_value = transaction_dates.item(0, "start")
    as_of_value = balance_dates.item(0, "as_of")
    if not isinstance(start_value, datetime) or not isinstance(as_of_value, datetime):
        raise ValueError("Could not determine analysis dates")
    return start_value.date().replace(day=1), as_of_value.date()


def _transaction_features(data_dir: Path, as_of: date) -> tuple[pl.DataFrame, pl.DataFrame]:
    products = pl.scan_csv(data_dir / "banking_products.csv").select(
        "product_id",
        pl.col("type").alias("product_type"),
        pl.col("currency").alias("product_currency"),
    )
    companies = pl.scan_csv(data_dir / "companies.csv").select(
        "company_id",
        pl.col("currency").alias("company_currency"),
    )
    transactions = (
        pl.scan_csv(
            data_dir / "transactions.csv",
            schema_overrides={
                "date": pl.String,
                "value_date": pl.String,
                "amount": pl.Float64,
                "exchange_rate": pl.Float64,
            },
        )
        .join(products, on="product_id", how="left")
        .join(companies, on="company_id", how="left")
        .with_columns(
            _timestamp("date").alias("transaction_at"),
            pl.col("category").fill_null("-").alias("category"),
            pl.when(pl.col("exchange_rate").is_not_null() & (pl.col("exchange_rate") > 0))
            .then(pl.col("exchange_rate"))
            .otherwise(1.0)
            .alias("valid_exchange_rate"),
            (
                pl.col("product_type").is_in(list(LIQUID_BANKING_PRODUCT_TYPES))
                & (pl.col("product_currency") == pl.col("company_currency"))
            ).alias("is_base_currency_liquid"),
        )
        .filter(
            (pl.col("status") == "booked")
            & (pl.col("transaction_at") < pl.lit(as_of))
        )
        .with_columns(
            pl.col("transaction_at").dt.truncate("1mo").cast(pl.Date).alias("month"),
            (pl.col("amount") * pl.col("valid_exchange_rate")).alias("normalized_amount"),
        )
        .with_columns(
            (
                (pl.col("normalized_amount") > 0)
                & ~pl.col("category").is_in(list(OPERATING_INFLOW_EXCLUSIONS))
            ).alias("is_operating_inflow"),
            (
                (pl.col("normalized_amount") < 0)
                & ~pl.col("category").is_in(list(OPERATING_OUTFLOW_EXCLUSIONS))
            ).alias("is_operating_outflow"),
        )
    )

    monthly = (
        transactions.group_by("company_id", "month")
        .agg(
            pl.when(pl.col("is_base_currency_liquid"))
            .then(pl.col("amount"))
            .otherwise(0.0)
            .sum()
            .alias("net_cash_change"),
            pl.when(pl.col("is_operating_inflow"))
            .then(pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("operating_inflow"),
            pl.when(pl.col("is_operating_outflow"))
            .then(-pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("operating_outflow"),
            pl.when(
                (pl.col("normalized_amount") < 0)
                & pl.col("category").is_in(list(MANDATORY_OUTFLOW_CATEGORIES))
            )
            .then(-pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("mandatory_outflow"),
            pl.when(
                (pl.col("normalized_amount") < 0)
                & pl.col("category").is_in(["debt_repayment", "interest_charge"])
            )
            .then(-pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("debt_service"),
            pl.when(
                (pl.col("normalized_amount") < 0)
                & pl.col("category").is_in(["interest_charge", "fee"])
            )
            .then(-pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("interest_and_fees"),
            pl.when(
                (pl.col("normalized_amount") < 0)
                & (pl.col("category") == "collection_refund")
            )
            .then(-pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("collection_refunds"),
            pl.col("normalized_amount").abs().sum().alias("absolute_cash_volume"),
            pl.when(pl.col("category") == "-")
            .then(pl.col("normalized_amount").abs())
            .otherwise(0.0)
            .sum()
            .alias("uncategorized_cash_volume"),
            pl.when(pl.col("is_operating_inflow") & pl.col("counterparty_id").is_not_null())
            .then(pl.col("normalized_amount"))
            .otherwise(0.0)
            .sum()
            .alias("known_counterparty_inflow"),
            pl.len().alias("transaction_count"),
        )
        .collect()
    )

    concentration = (
        transactions.filter(
            pl.col("is_operating_inflow") & pl.col("counterparty_id").is_not_null()
        )
        .group_by("company_id", "month", "counterparty_id")
        .agg(pl.col("normalized_amount").sum().alias("counterparty_inflow"))
        .group_by("company_id", "month")
        .agg(
            (
                pl.col("counterparty_inflow").pow(2).sum()
                / pl.col("counterparty_inflow").sum().pow(2)
            ).alias("inflow_concentration")
        )
        .collect()
    )

    first_activity = monthly.group_by("company_id").agg(pl.col("month").min().alias("first_activity_month"))
    return monthly.join(concentration, on=["company_id", "month"], how="left"), first_activity


def _final_liquid_cash(data_dir: Path) -> pl.DataFrame:
    companies = pl.read_csv(data_dir / "companies.csv").select(
        "company_id",
        pl.col("currency").alias("company_currency"),
    )
    products = (
        pl.read_csv(data_dir / "banking_products.csv")
        .rename({"currency": "product_currency"})
        .join(companies, on="company_id", how="left")
        .filter(
            pl.col("type").is_in(list(LIQUID_BANKING_PRODUCT_TYPES))
            & (pl.col("product_currency") == pl.col("company_currency"))
        )
    )
    balances = pl.read_csv(
        data_dir / "balances.csv",
        schema_overrides={
            "date": pl.String,
            "balance": pl.Float64,
            "available": pl.Float64,
            "granted": pl.Float64,
            "liquidity": pl.Float64,
            "countable": pl.Float64,
        },
    )
    return (
        balances.join(products.select("product_id", "company_id"), on=["product_id", "company_id"], how="inner")
        .group_by("company_id")
        .agg(pl.col("balance").sum().alias("final_liquid_cash"))
    )


def _invoice_features(data_dir: Path, last_month: date) -> tuple[pl.DataFrame, pl.DataFrame]:
    invoices = (
        pl.scan_csv(
            data_dir / "invoices.csv",
            schema_overrides={
                "issuance_date": pl.String,
                "due_date": pl.String,
                "payment_date": pl.String,
                "amount": pl.Float64,
                "pending_amount": pl.Float64,
                "exchange_rate": pl.Float64,
            },
        )
        .filter(pl.col("document_type") == "invoice")
        .with_columns(
            _month("due_date").alias("due_month"),
            _month("payment_date").alias("payment_month"),
            (
                pl.col("amount").abs()
                * pl.when(pl.col("exchange_rate").is_not_null() & (pl.col("exchange_rate") > 0))
                .then(pl.col("exchange_rate"))
                .otherwise(1.0)
            ).alias("invoice_amount"),
        )
        .filter(pl.col("due_month").is_not_null() & (pl.col("due_month") <= pl.lit(last_month)))
    )

    source = invoices.select("company_id").unique().collect().with_columns(pl.lit(True).alias("has_invoice_source"))

    due_volume = (
        invoices.group_by("company_id", pl.col("due_month").alias("month"))
        .agg(pl.col("invoice_amount").sum().alias("invoice_due_amount"))
        .collect()
    )

    overdue = (
        invoices.with_columns(
            pl.when(pl.col("payment_month").is_not_null())
            .then(pl.col("payment_month").dt.offset_by("-1mo"))
            .otherwise(pl.lit(last_month))
            .alias("overdue_end_month")
        )
        .filter(
            (pl.col("due_month") <= pl.col("overdue_end_month"))
            & ~pl.col("status").is_in(["cancel", "cancelled"])
        )
        .with_columns(
            pl.date_ranges(
                "due_month",
                "overdue_end_month",
                interval="1mo",
                closed="both",
            ).alias("month")
        )
        .explode("month")
        .group_by("company_id", "month")
        .agg(pl.col("invoice_amount").sum().alias("overdue_invoice_amount"))
        .collect()
    )

    return due_volume.join(overdue, on=["company_id", "month"], how="full", coalesce=True), source


def build_monthly_features(data_dir: Path) -> pl.DataFrame:
    companies = _load_companies(data_dir)
    start_month, as_of = _analysis_dates(data_dir)
    months = _month_sequence(start_month, as_of)
    if not months:
        raise ValueError("No complete monthly periods precede the balance snapshot")
    last_month = months[-1]

    transaction_monthly, first_activity = _transaction_features(data_dir, as_of)
    invoice_monthly, invoice_source = _invoice_features(data_dir, last_month)
    final_cash = _final_liquid_cash(data_dir)

    grid = (
        companies.join(pl.DataFrame({"month": months}), how="cross")
        .join(first_activity, on="company_id", how="left")
        .filter(
            pl.col("month")
            >= pl.col("first_activity_month").fill_null(pl.lit(last_month))
        )
        .drop("first_activity_month")
    )

    flow_columns = [
        "net_cash_change",
        "operating_inflow",
        "operating_outflow",
        "mandatory_outflow",
        "debt_service",
        "interest_and_fees",
        "collection_refunds",
        "absolute_cash_volume",
        "uncategorized_cash_volume",
        "known_counterparty_inflow",
        "transaction_count",
    ]

    frame = (
        grid.join(transaction_monthly, on=["company_id", "month"], how="left")
        .join(invoice_monthly, on=["company_id", "month"], how="left")
        .join(invoice_source, on="company_id", how="left")
        .join(final_cash, on="company_id", how="left")
        .sort("company_id", "month")
        .with_columns(
            [pl.col(column).fill_null(0) for column in flow_columns]
            + [pl.col("has_invoice_source").fill_null(False)]
        )
        .with_columns(
            (
                pl.col("final_liquid_cash")
                - (
                    pl.col("net_cash_change").sum().over("company_id")
                    - pl.col("net_cash_change").cum_sum().over("company_id")
                )
            ).alias("reconstructed_liquid_cash"),
            _rolling_sum("operating_inflow", 3).alias("operating_inflow_3m"),
            _rolling_sum("operating_outflow", 3).alias("operating_outflow_3m"),
            _rolling_sum("mandatory_outflow", 3).alias("mandatory_outflow_3m"),
            _rolling_sum("debt_service", 3).alias("debt_service_3m"),
            _rolling_sum("interest_and_fees", 3).alias("interest_and_fees_3m"),
            _rolling_sum("collection_refunds", 3).alias("collection_refunds_3m"),
            _rolling_sum("absolute_cash_volume", 3).alias("absolute_cash_volume_3m"),
            _rolling_sum("uncategorized_cash_volume", 3).alias("uncategorized_cash_volume_3m"),
            _rolling_sum("known_counterparty_inflow", 3).alias("known_counterparty_inflow_3m"),
            _rolling_mean("inflow_concentration", 3).alias("inflow_concentration_3m"),
            _rolling_median("operating_outflow", 3).alias("typical_monthly_outflow_3m"),
            _rolling_sum("invoice_due_amount", 3).alias("invoice_due_amount_3m"),
            pl.col("month").cum_count().over("company_id").alias("history_months"),
        )
        .with_columns(
            pl.when(pl.col("operating_outflow_3m") > 0)
            .then(pl.col("operating_inflow_3m") / pl.col("operating_outflow_3m"))
            .otherwise(5.0)
            .clip(0.0, 5.0)
            .alias("operating_coverage_3m"),
            pl.when(pl.col("operating_inflow_3m") > 0)
            .then(
                (pl.col("operating_inflow_3m") - pl.col("operating_outflow_3m"))
                / pl.col("operating_inflow_3m")
            )
            .otherwise(-3.0)
            .clip(-3.0, 1.0)
            .alias("cash_margin_3m"),
            pl.when(pl.col("mandatory_outflow_3m") > 0)
            .then(pl.col("operating_inflow_3m") / pl.col("mandatory_outflow_3m"))
            .otherwise(20.0)
            .clip(0.0, 20.0)
            .alias("fixed_obligation_coverage_3m"),
            pl.when(pl.col("operating_inflow_3m") > 0)
            .then(pl.col("debt_service_3m") / pl.col("operating_inflow_3m"))
            .otherwise(pl.when(pl.col("debt_service_3m") > 0).then(3.0).otherwise(0.0))
            .clip(0.0, 3.0)
            .alias("debt_service_burden_3m"),
            pl.when(pl.col("operating_inflow_3m") > 0)
            .then(pl.col("interest_and_fees_3m") / pl.col("operating_inflow_3m"))
            .otherwise(pl.when(pl.col("interest_and_fees_3m") > 0).then(1.0).otherwise(0.0))
            .clip(0.0, 1.0)
            .alias("interest_fee_burden_3m"),
            pl.when(pl.col("operating_inflow_3m") > 0)
            .then(pl.col("collection_refunds_3m") / pl.col("operating_inflow_3m"))
            .otherwise(pl.when(pl.col("collection_refunds_3m") > 0).then(1.0).otherwise(0.0))
            .clip(0.0, 1.0)
            .alias("refund_rate_3m"),
            pl.when(pl.col("typical_monthly_outflow_3m") > 0)
            .then(pl.col("reconstructed_liquid_cash").clip(lower_bound=0) / pl.col("typical_monthly_outflow_3m"))
            .otherwise(None)
            .clip(0.0, 12.0)
            .alias("cash_buffer_months"),
            pl.when(pl.col("absolute_cash_volume_3m") > 0)
            .then(1.0 - pl.col("uncategorized_cash_volume_3m") / pl.col("absolute_cash_volume_3m"))
            .otherwise(0.0)
            .clip(0.0, 1.0)
            .alias("category_coverage_3m"),
            pl.when(pl.col("operating_inflow_3m") > 0)
            .then(pl.col("known_counterparty_inflow_3m") / pl.col("operating_inflow_3m"))
            .otherwise(0.0)
            .clip(0.0, 1.0)
            .alias("counterparty_coverage_3m"),
        )
        .with_columns(
            pl.when(pl.col("has_invoice_source"))
            .then(
                pl.when(pl.col("invoice_due_amount_3m").fill_null(0) > 0)
                .then(
                    pl.col("overdue_invoice_amount").fill_null(0)
                    / (pl.col("invoice_due_amount_3m") / 3.0)
                )
                .otherwise(pl.when(pl.col("overdue_invoice_amount").fill_null(0) > 0).then(12.0).otherwise(0.0))
            )
            .otherwise(None)
            .clip(0.0, 12.0)
            .alias("invoice_overdue_backlog_months"),
            pl.when(pl.col("cash_margin_3m") < 0)
            .then(pl.col("cash_margin_3m").pow(2))
            .otherwise(0.0)
            .alias("downside_squared"),
        )
        .with_columns(
            _rolling_mean("downside_squared", 6)
            .sqrt()
            .clip(0.0, 3.0)
            .alias("downside_volatility_6m")
        )
        .with_columns(
            [
                pl.when(pl.col("absolute_cash_volume_3m") > 0)
                .then(pl.col(column))
                .otherwise(None)
                .alias(column)
                for column in [
                    "operating_coverage_3m",
                    "cash_margin_3m",
                    "fixed_obligation_coverage_3m",
                    "debt_service_burden_3m",
                    "interest_fee_burden_3m",
                    "downside_volatility_6m",
                    "inflow_concentration_3m",
                    "refund_rate_3m",
                ]
            ]
        )
        .drop("downside_squared")
    )

    return frame
