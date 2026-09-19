"""Purged walk-forward evaluation utilities and command-line reports."""

from __future__ import annotations

import argparse
import json
import zlib
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class RollingFold:
    fold: int
    train_indices: tuple[int, ...]
    validation_indices: tuple[int, ...]
    train_end: str
    validation_start: str
    validation_end: str


def purged_walk_forward_folds(
    rows: pd.DataFrame,
    *,
    date_column: str = "as_of",
    group_column: str = "group_id",
    horizon_days: int = 180,
    validation_days: int = 90,
    minimum_training_days: int = 365,
) -> Iterator[RollingFold]:
    """Yield temporal folds with a horizon-sized purge and group-disjoint partitions."""

    frame = rows.copy()
    frame[date_column] = pd.to_datetime(frame[date_column])
    first = frame[date_column].min() + pd.Timedelta(days=minimum_training_days + horizon_days)
    last = frame[date_column].max()
    fold_number = 0
    validation_start = first
    while validation_start <= last:
        validation_end = min(last, validation_start + pd.Timedelta(days=validation_days - 1))
        train_end = validation_start - pd.Timedelta(days=horizon_days + 1)
        validation_mask = frame[date_column].between(validation_start, validation_end)
        validation_groups = set(frame.loc[validation_mask, group_column].dropna())
        # A deterministic group partition prevents subsidiaries crossing train/validation.
        held_out = {
            group
            for group in validation_groups
            if zlib.crc32(str(group).encode("utf-8")) % 5 == fold_number % 5
        }
        validation_mask &= frame[group_column].isin(held_out)
        train_mask = frame[date_column].le(train_end) & ~frame[group_column].isin(held_out)
        if train_mask.any() and validation_mask.any():
            yield RollingFold(
                fold=fold_number,
                train_indices=tuple(frame.index[train_mask].tolist()),
                validation_indices=tuple(frame.index[validation_mask].tolist()),
                train_end=train_end.isoformat(),
                validation_start=validation_start.isoformat(),
                validation_end=validation_end.isoformat(),
            )
        fold_number += 1
        validation_start += pd.Timedelta(days=validation_days)


def treasury_stress_outcome(rows: pd.DataFrame) -> pd.Series:
    """Transparent 90-day stress composite; each input condition remains reportable."""

    required = {
        "cash_runway_days",
        "debt_service_coverage",
        "overdue_payables_ratio",
        "negative_cashflow_month_fraction",
    }
    missing = required - set(rows.columns)
    if missing:
        raise ValueError(f"stress rows are missing columns: {sorted(missing)}")
    conditions = pd.DataFrame(
        {
            "low_runway": rows["cash_runway_days"].lt(15),
            "debt_uncovered": rows["debt_service_coverage"].lt(1),
            "supplier_stress": rows["overdue_payables_ratio"].gt(0.4),
            "persistent_negative_cashflow": rows["negative_cashflow_month_fraction"].gt(0.66),
        }
    )
    return conditions.sum(axis=1).ge(2)


def evaluate_predictions(predictions: pd.DataFrame) -> dict[str, object]:
    required = {"horizon_days", "actual_score", "predicted_score"}
    missing = required - set(predictions.columns)
    if missing:
        raise ValueError(f"prediction file is missing columns: {sorted(missing)}")
    report: dict[str, object] = {"by_horizon": {}}
    for horizon, rows in predictions.groupby("horizon_days"):
        error = rows["predicted_score"] - rows["actual_score"]
        metrics: dict[str, float | int] = {
            "rows": len(rows),
            "mae": round(float(error.abs().mean()), 4),
            "bias": round(float(error.mean()), 4),
        }
        if {"current_score"}.issubset(rows.columns):
            actual_change = rows["actual_score"] - rows["current_score"]
            predicted_change = rows["predicted_score"] - rows["current_score"]
            metrics["direction_accuracy"] = round(
                float((np.sign(actual_change) == np.sign(predicted_change)).mean()), 4
            )
            actual_drop = actual_change.le(-15)
            metrics["large_drop_recall"] = (
                round(float(predicted_change.loc[actual_drop].le(-15).mean()), 4)
                if actual_drop.any()
                else 0.0
            )
        if {"interval_lower", "interval_upper"}.issubset(rows.columns):
            covered = rows["actual_score"].between(rows["interval_lower"], rows["interval_upper"])
            metrics["interval_coverage"] = round(float(covered.mean()), 4)
            metrics["interval_average_width"] = round(
                float((rows["interval_upper"] - rows["interval_lower"]).mean()), 4
            )
        report["by_horizon"][str(int(horizon))] = metrics
    if "model" in predictions:
        report["by_model"] = {
            str(name): round(
                float((rows["predicted_score"] - rows["actual_score"]).abs().mean()), 4
            )
            for name, rows in predictions.groupby("model")
        }
    return report


def lightgbm_acceptance_gate(
    comparisons: pd.DataFrame,
    *,
    minimum_relative_mae_improvement: float = 0.02,
    maximum_coverage_degradation: float = 0.02,
) -> dict[tuple[str, int], bool]:
    """Accept residual models only where OOF accuracy improves without harming tails.

    Required columns are target, horizon_days, actual, baseline, lightgbm, and is_out_of_fold.
    Optional interval columns enable the coverage part of the gate.
    """

    required = {
        "target",
        "horizon_days",
        "actual",
        "baseline",
        "lightgbm",
        "is_out_of_fold",
    }
    missing = required - set(comparisons.columns)
    if missing:
        raise ValueError(f"comparison frame is missing columns: {sorted(missing)}")
    if not comparisons["is_out_of_fold"].astype(bool).all():
        raise ValueError("model acceptance requires out-of-fold predictions")
    decisions: dict[tuple[str, int], bool] = {}
    for (target, horizon), rows in comparisons.groupby(["target", "horizon_days"]):
        baseline_mae = float((rows["actual"] - rows["baseline"]).abs().mean())
        model_mae = float((rows["actual"] - rows["lightgbm"]).abs().mean())
        relative = (baseline_mae - model_mae) / max(baseline_mae, 1e-12)
        coverage_ok = True
        interval_columns = {
            "baseline_lower",
            "baseline_upper",
            "lightgbm_lower",
            "lightgbm_upper",
        }
        if interval_columns.issubset(rows.columns):
            baseline_coverage = (
                rows["actual"].between(rows["baseline_lower"], rows["baseline_upper"]).mean()
            )
            model_coverage = (
                rows["actual"].between(rows["lightgbm_lower"], rows["lightgbm_upper"]).mean()
            )
            coverage_ok = model_coverage >= baseline_coverage - maximum_coverage_degradation
        decisions[(str(target), int(horizon))] = bool(
            relative >= minimum_relative_mae_improvement and coverage_ok
        )
    return decisions


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate out-of-fold X-Ray forecasts")
    parser.add_argument("predictions", help="CSV or Parquet file with forecast outcomes")
    parser.add_argument("--output", help="optional JSON report path")
    args = parser.parse_args(argv)
    path = Path(args.predictions)
    frame = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
    report = evaluate_predictions(frame)
    payload = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
    print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
