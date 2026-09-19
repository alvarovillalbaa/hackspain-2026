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

from .calibration import CalibrationArtifact, fit_calibration_artifact
from .features import calculate_features
from .forecast import BaselineForecaster
from .ledger import Ledger
from .scorecard import Scorecard


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


def evaluate_probability_calibration(
    artifact: CalibrationArtifact, predictions: pd.DataFrame
) -> dict[str, dict[str, dict[str, float | int]]]:
    report: dict[str, dict[str, dict[str, float | int]]] = {}
    records: list[dict[str, object]] = []
    for row in predictions.itertuples(index=False):
        horizon = int(row.horizon_days)
        residuals = artifact.score_residuals.get(horizon)
        if residuals is None or not len(residuals):
            continue
        scenarios = np.clip(float(row.predicted_score) + residuals, 0, 100)
        raw = {
            "score_below_40": float(np.mean(scenarios < 40)),
            "decline_at_least_15": float(np.mean(scenarios <= float(row.current_score) - 15)),
        }
        actual = {
            "score_below_40": float(row.actual_score) < 40,
            "decline_at_least_15": float(row.actual_score) <= float(row.current_score) - 15,
        }
        for event, probability in raw.items():
            calibrator = artifact.probability_calibrators.get(f"{horizon}:{event}")
            calibrated = (
                float(calibrator.predict(probability)[0]) if calibrator is not None else probability
            )
            records.append(
                {
                    "horizon": horizon,
                    "event": event,
                    "probability": calibrated,
                    "actual": float(actual[event]),
                }
            )
    frame = pd.DataFrame(records)
    for (horizon, event), rows in frame.groupby(["horizon", "event"]):
        report.setdefault(str(int(horizon)), {})[str(event)] = {
            "rows": len(rows),
            "event_rate": round(float(rows["actual"].mean()), 4),
            "mean_probability": round(float(rows["probability"].mean()), 4),
            "brier_score": round(float(((rows["probability"] - rows["actual"]) ** 2).mean()), 4),
        }
    return report


def baseline_walk_forward_backtest(
    ledger: Ledger,
    entity_ids: list[str],
    origins: list[pd.Timestamp],
    *,
    horizons: tuple[int, ...] = (30, 90, 180),
    minimum_history_days: int = 365,
) -> pd.DataFrame:
    """Generate strictly trailing baseline predictions and reconstructed future outcomes."""

    rows: list[dict[str, object]] = []
    scorecard = Scorecard()
    forecaster = BaselineForecaster(ledger, scorecard)
    maximum_horizon = max(horizons)
    for entity_number, entity_id in enumerate(entity_ids, start=1):
        for origin in origins:
            try:
                current_snapshot = ledger.snapshot(entity_id, origin)
                if (
                    not current_snapshot.coverage.transactions
                    or not current_snapshot.coverage.reconstructable_balance
                    or current_snapshot.coverage.history_days < minimum_history_days
                ):
                    continue
                current_panel = calculate_features(current_snapshot)
                current = scorecard.score(current_panel)
                forecast = forecaster.forecast(
                    entity_id,
                    origin,
                    horizon_days=maximum_horizon,
                    score_horizons=horizons,
                )
                for horizon in horizons:
                    target = current_snapshot.as_of + pd.Timedelta(days=horizon)
                    actual_snapshot = ledger.snapshot(entity_id, target)
                    if (
                        not actual_snapshot.coverage.transactions
                        or not actual_snapshot.coverage.reconstructable_balance
                    ):
                        continue
                    actual_panel = calculate_features(actual_snapshot)
                    actual = scorecard.score(actual_panel)
                    predicted = forecast.horizons[horizon].score
                    rows.append(
                        {
                            "entity_id": entity_id,
                            "origin": current_snapshot.as_of,
                            "target_date": target,
                            "horizon_days": horizon,
                            "current_score": current.score,
                            "predicted_score": predicted.score,
                            "actual_score": actual.score,
                            "confidence": current.confidence,
                            "balance_reliability": current_snapshot.coverage.balance_reliability,
                            "reconstructed_products": current_snapshot.audit.get(
                                "backward_reconstructed_products", 0
                            ),
                            "is_out_of_fold": True,
                            "model": forecaster.model_version,
                        }
                    )
            except (KeyError, ValueError, IndexError):
                continue
        if entity_number % 25 == 0:
            print(
                f"backtested {entity_number}/{len(entity_ids)} entities; {len(rows)} rows",
                flush=True,
            )
    return pd.DataFrame(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Backtest and evaluate X-Ray forecasts")
    subparsers = parser.add_subparsers(dest="command", required=True)
    report_parser = subparsers.add_parser("report", help="report metrics from predictions")
    report_parser.add_argument("predictions", help="CSV or Parquet forecast outcomes")
    report_parser.add_argument("--output", help="optional JSON report path")
    backtest_parser = subparsers.add_parser(
        "backtest", help="fit calibration from reconstructed balance histories"
    )
    backtest_parser.add_argument("--data", default="artifacts/cache")
    backtest_parser.add_argument(
        "--predictions-output", default="artifacts/calibration/predictions.parquet"
    )
    backtest_parser.add_argument(
        "--artifact-output", default="artifacts/calibration/calibration.pkl"
    )
    backtest_parser.add_argument("--origin-start")
    backtest_parser.add_argument("--origin-end")
    backtest_parser.add_argument("--frequency", default="ME")
    backtest_parser.add_argument("--entity-type", choices=("group", "company"), default="group")
    backtest_parser.add_argument("--max-entities", type=int)
    backtest_parser.add_argument("--minimum-history-days", type=int, default=365)
    backtest_parser.add_argument("--coverage", type=float, default=0.80)
    args = parser.parse_args(argv)
    if args.command == "report":
        path = Path(args.predictions)
        frame = pd.read_parquet(path) if path.suffix == ".parquet" else pd.read_csv(path)
        report = evaluate_predictions(frame)
        payload = json.dumps(report, indent=2)
        if args.output:
            Path(args.output).write_text(payload, encoding="utf-8")
        print(payload)
        return 0

    ledger = Ledger(args.data, reconstruct_balances=True)
    maximum_horizon = 180
    transaction_start = pd.to_datetime(ledger.transactions["date"]).min().normalize()
    data_end = pd.to_datetime(ledger.balances["date"]).max().normalize()
    origin_start = (
        pd.Timestamp(args.origin_start)
        if args.origin_start
        else transaction_start + pd.Timedelta(days=365)
    )
    origin_end = (
        pd.Timestamp(args.origin_end)
        if args.origin_end
        else data_end - pd.Timedelta(days=maximum_horizon)
    )
    origins = list(pd.date_range(origin_start, origin_end, freq=args.frequency))
    if not origins:
        raise ValueError("no valid backtest origins for the selected date range")
    if args.entity_type == "group":
        entity_ids = sorted(ledger.companies["group_id"].dropna().unique().tolist())
    else:
        entity_ids = sorted(ledger.companies["company_id"].dropna().unique().tolist())
    if args.max_entities:
        entity_ids = entity_ids[: args.max_entities]
    predictions = baseline_walk_forward_backtest(
        ledger,
        entity_ids,
        origins,
        minimum_history_days=args.minimum_history_days,
    )
    if predictions.empty:
        raise ValueError("backtest produced no predictions")
    prediction_path = Path(args.predictions_output)
    prediction_path.parent.mkdir(parents=True, exist_ok=True)
    predictions.to_parquet(prediction_path, index=False)
    unique_origins = sorted(pd.to_datetime(predictions["origin"]).unique())
    if len(unique_origins) < 3:
        raise ValueError("at least three historical origins are required for calibration")
    calibration_origin_count = max(2, int(np.floor(len(unique_origins) * 0.67)))
    calibration_origins = unique_origins[:calibration_origin_count]
    validation_origins = unique_origins[calibration_origin_count:]
    calibration_rows = predictions.loc[
        pd.to_datetime(predictions["origin"]).isin(calibration_origins)
    ].copy()
    validation_rows = predictions.loc[
        pd.to_datetime(predictions["origin"]).isin(validation_origins)
    ].copy()
    artifact = fit_calibration_artifact(
        calibration_rows,
        coverage=args.coverage,
        metadata={
            "model_version": BaselineForecaster.model_version,
            "score_version": Scorecard().config.version,
            "entity_type": args.entity_type,
            "origin_start": min(origins).isoformat(),
            "origin_end": max(origins).isoformat(),
            "balance_mode": "single_anchor_backward",
            "balance_reliability": 0.75,
            "calibration_origins": [
                pd.Timestamp(origin).isoformat() for origin in calibration_origins
            ],
            "validation_origins": [
                pd.Timestamp(origin).isoformat() for origin in validation_origins
            ],
        },
    )
    validation_rows["interval_lower"] = validation_rows.apply(
        lambda row: artifact.conformal.interval(
            float(row["predicted_score"]) + artifact.point_bias[int(row["horizon_days"])],
            int(row["horizon_days"]),
            str(row["confidence"]),
        )[0],
        axis=1,
    )
    validation_rows["interval_upper"] = validation_rows.apply(
        lambda row: artifact.conformal.interval(
            float(row["predicted_score"]) + artifact.point_bias[int(row["horizon_days"])],
            int(row["horizon_days"]),
            str(row["confidence"]),
        )[1],
        axis=1,
    )
    validation_report = evaluate_predictions(validation_rows)
    validation_report["probability_calibration"] = evaluate_probability_calibration(
        artifact, validation_rows
    )
    artifact.metadata["validation"] = validation_report
    artifact.save(args.artifact_output)
    report = evaluate_predictions(predictions)
    print(
        json.dumps(
            {
                "predictions": str(prediction_path),
                "artifact": str(args.artifact_output),
                "origins": [origin.isoformat() for origin in origins],
                "entities": len(entity_ids),
                "calibration": artifact.metadata,
                "backtest_evaluation": report,
                "untouched_validation": validation_report,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
