"""Out-of-fold conformal intervals and threshold-probability calibration."""

from __future__ import annotations

import json
import pickle
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


def _require_oof(frame: pd.DataFrame) -> None:
    if "is_out_of_fold" not in frame or not frame["is_out_of_fold"].astype(bool).all():
        raise ValueError("calibration accepts only rows explicitly marked is_out_of_fold=True")


@dataclass
class ConformalScoreCalibrator:
    coverage: float = 0.80
    minimum_tier_size: int = 50
    corrections: dict[tuple[int, str], float] = field(default_factory=dict)
    empirical_coverage: dict[tuple[int, str], float] = field(default_factory=dict)
    version: str = "score-conformal-v1.0"

    def fit(self, predictions: pd.DataFrame) -> ConformalScoreCalibrator:
        """Fit on OOF columns: horizon_days, actual, prediction, is_out_of_fold[, tier]."""

        required = {"horizon_days", "actual", "prediction", "is_out_of_fold"}
        missing = required - set(predictions.columns)
        if missing:
            raise ValueError(f"calibration frame is missing columns: {sorted(missing)}")
        _require_oof(predictions)
        frame = predictions.copy()
        frame["tier"] = frame.get("tier", "all")
        alpha = 1 - self.coverage
        for horizon, horizon_rows in frame.groupby("horizon_days"):
            global_residual = (horizon_rows["actual"] - horizon_rows["prediction"]).abs()
            n = len(global_residual)
            quantile_level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
            global_q = float(global_residual.quantile(quantile_level, interpolation="higher"))
            self.corrections[(int(horizon), "all")] = global_q
            self.empirical_coverage[(int(horizon), "all")] = float(
                global_residual.le(global_q).mean()
            )
            for tier, rows in horizon_rows.groupby("tier"):
                if tier == "all" or len(rows) < self.minimum_tier_size:
                    continue
                residual = (rows["actual"] - rows["prediction"]).abs()
                level = min(1.0, np.ceil((len(rows) + 1) * (1 - alpha)) / len(rows))
                q = float(residual.quantile(level, interpolation="higher"))
                self.corrections[(int(horizon), str(tier))] = q
                self.empirical_coverage[(int(horizon), str(tier))] = float(residual.le(q).mean())
        return self

    def interval(
        self, prediction: float, horizon_days: int, tier: str = "all"
    ) -> tuple[float, float]:
        correction = self.corrections.get((horizon_days, tier))
        if correction is None:
            correction = self.corrections.get((horizon_days, "all"))
        if correction is None:
            raise KeyError(f"no calibration for horizon {horizon_days}")
        return round(max(0.0, prediction - correction), 2), round(
            min(100.0, prediction + correction), 2
        )


@dataclass
class IsotonicProbabilityCalibrator:
    """Dependency-light PAVA calibrator for OOF event probabilities."""

    thresholds: np.ndarray | None = None
    calibrated: np.ndarray | None = None
    version: str = "threshold-isotonic-v1.0"

    def fit(self, probabilities: pd.DataFrame) -> IsotonicProbabilityCalibrator:
        required = {"probability", "event", "is_out_of_fold"}
        missing = required - set(probabilities.columns)
        if missing:
            raise ValueError(f"probability frame is missing columns: {sorted(missing)}")
        _require_oof(probabilities)
        ordered = probabilities.sort_values("probability")
        x = ordered["probability"].clip(0, 1).to_numpy(dtype=float)
        y = ordered["event"].astype(float).to_numpy()
        if len(x) < 2:
            raise ValueError("at least two calibration observations are required")
        # Pool-adjacent-violators over individual observations.
        values = list(y)
        weights = [1] * len(y)
        starts = list(range(len(y)))
        ends = list(range(len(y)))
        i = 0
        while i < len(values) - 1:
            if values[i] <= values[i + 1]:
                i += 1
                continue
            weight = weights[i] + weights[i + 1]
            value = (values[i] * weights[i] + values[i + 1] * weights[i + 1]) / weight
            values[i : i + 2] = [value]
            weights[i : i + 2] = [weight]
            ends[i] = ends[i + 1]
            del starts[i + 1], ends[i + 1]
            i = max(0, i - 1)
        self.thresholds = np.array([x[end] for end in ends])
        self.calibrated = np.array(values)
        return self

    def predict(self, probability: float | np.ndarray) -> np.ndarray:
        if self.thresholds is None or self.calibrated is None:
            raise RuntimeError("calibrator is not fitted")
        values = np.atleast_1d(probability).astype(float)
        indices = np.searchsorted(self.thresholds, values, side="left").clip(
            0, len(self.calibrated) - 1
        )
        return self.calibrated[indices]


@dataclass
class CalibrationArtifact:
    """Persisted score-interval and threshold calibration fitted from OOF rows."""

    conformal: ConformalScoreCalibrator
    probability_calibrators: dict[str, IsotonicProbabilityCalibrator]
    score_residuals: dict[int, np.ndarray]
    point_bias: dict[int, float]
    metadata: dict[str, Any]
    version: str = "xray-calibration-v1.0"

    def apply(
        self,
        forecast: Any,
        *,
        current_score: float,
        entity_type: str | None = None,
    ) -> Any:
        fitted_entity_type = self.metadata.get("entity_type")
        if entity_type is not None and fitted_entity_type not in {None, entity_type}:
            raise ValueError(f"calibration was fitted for {fitted_entity_type}, not {entity_type}")
        intervals: dict[int, tuple[float, float] | None] = {}
        medians: dict[int, float] = {}
        probabilities: dict[int, dict[str, float] | None] = {}
        for horizon, result in forecast.horizons.items():
            residuals = self.score_residuals.get(int(horizon))
            if residuals is None or not len(residuals):
                intervals[horizon] = None
                probabilities[horizon] = None
                continue
            prediction = float(result.score.score)
            calibrated_prediction = float(
                np.clip(prediction + self.point_bias.get(int(horizon), 0.0), 0, 100)
            )
            medians[horizon] = round(calibrated_prediction, 2)
            intervals[horizon] = self.conformal.interval(
                calibrated_prediction, int(horizon), result.score.confidence
            )
            scenarios = np.clip(prediction + residuals, 0, 100)
            raw = {
                "score_below_40": float(np.mean(scenarios < 40)),
                "decline_at_least_15": float(np.mean(scenarios <= current_score - 15)),
            }
            probabilities[horizon] = {}
            for event, probability in raw.items():
                calibrator = self.probability_calibrators.get(f"{horizon}:{event}")
                probabilities[horizon][event] = round(
                    float(calibrator.predict(probability)[0])
                    if calibrator is not None
                    else probability,
                    4,
                )
        forecast.intervals = intervals
        forecast.calibrated_medians = medians
        forecast.threshold_probabilities = probabilities
        forecast.calibration_version = self.version
        forecast.calibration_status = "calibrated_out_of_fold"
        forecast.calibration_metadata = {
            key: self.metadata.get(key)
            for key in (
                "entity_type",
                "coverage_target",
                "rows",
                "rows_by_horizon",
                "balance_mode",
                "balance_reliability",
                "calibration_origins",
                "validation_origins",
                "validation",
            )
            if key in self.metadata
        }
        return forecast

    def save(self, path: str | Path) -> None:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(pickle.dumps(self))
        manifest = {
            "version": self.version,
            "metadata": self.metadata,
            "horizons": sorted(self.score_residuals),
            "corrections": {
                f"{horizon}:{tier}": value
                for (horizon, tier), value in self.conformal.corrections.items()
            },
            "point_bias": self.point_bias,
            "empirical_coverage": {
                f"{horizon}:{tier}": value
                for (horizon, tier), value in self.conformal.empirical_coverage.items()
            },
        }
        target.with_suffix(target.suffix + ".json").write_text(
            json.dumps(manifest, indent=2, default=str), encoding="utf-8"
        )

    @classmethod
    def load(cls, path: str | Path) -> CalibrationArtifact:
        artifact = pickle.loads(Path(path).read_bytes())
        if not isinstance(artifact, cls):
            raise TypeError("artifact is not a CalibrationArtifact")
        return artifact


def fit_calibration_artifact(
    predictions: pd.DataFrame,
    *,
    coverage: float = 0.80,
    minimum_tier_size: int = 50,
    metadata: dict[str, Any] | None = None,
) -> CalibrationArtifact:
    required = {
        "horizon_days",
        "actual_score",
        "predicted_score",
        "current_score",
        "is_out_of_fold",
    }
    missing = required - set(predictions.columns)
    if missing:
        raise ValueError(f"calibration predictions are missing columns: {sorted(missing)}")
    _require_oof(predictions)
    frame = predictions.dropna(subset=list(required - {"is_out_of_fold"})).copy()
    if frame.empty:
        raise ValueError("no complete calibration predictions")
    point_bias = {
        int(horizon): float((rows["actual_score"] - rows["predicted_score"]).median())
        for horizon, rows in frame.groupby("horizon_days")
    }
    conformal_frame = frame.rename(
        columns={"actual_score": "actual", "predicted_score": "prediction"}
    )
    conformal_frame["prediction"] = conformal_frame.apply(
        lambda row: float(row["prediction"]) + point_bias[int(row["horizon_days"])], axis=1
    )
    conformal_frame["tier"] = conformal_frame.get("confidence", "all")
    conformal = ConformalScoreCalibrator(
        coverage=coverage, minimum_tier_size=minimum_tier_size
    ).fit(conformal_frame)
    residuals: dict[int, np.ndarray] = {}
    calibrators: dict[str, IsotonicProbabilityCalibrator] = {}
    for horizon, rows in frame.groupby("horizon_days"):
        rows = rows.reset_index(drop=True)
        errors = (rows["actual_score"] - rows["predicted_score"]).to_numpy(dtype=float)
        residuals[int(horizon)] = errors
        if len(rows) < 3:
            continue
        probability_rows: dict[str, list[dict[str, object]]] = {
            "score_below_40": [],
            "decline_at_least_15": [],
        }
        for index, row in rows.iterrows():
            reference = np.delete(errors, index)
            scenarios = np.clip(float(row["predicted_score"]) + reference, 0, 100)
            raw = {
                "score_below_40": float(np.mean(scenarios < 40)),
                "decline_at_least_15": float(
                    np.mean(scenarios <= float(row["current_score"]) - 15)
                ),
            }
            outcomes = {
                "score_below_40": float(row["actual_score"]) < 40,
                "decline_at_least_15": float(row["actual_score"])
                <= float(row["current_score"]) - 15,
            }
            for event, event_rows in probability_rows.items():
                event_rows.append(
                    {
                        "probability": raw[event],
                        "event": outcomes[event],
                        "is_out_of_fold": True,
                    }
                )
        for event, event_rows in probability_rows.items():
            calibrators[f"{int(horizon)}:{event}"] = IsotonicProbabilityCalibrator().fit(
                pd.DataFrame(event_rows)
            )
    artifact_metadata = {
        "coverage_target": coverage,
        "rows": len(frame),
        "rows_by_horizon": {
            str(int(horizon)): len(rows) for horizon, rows in frame.groupby("horizon_days")
        },
        **(metadata or {}),
    }
    artifact_metadata["point_bias"] = point_bias
    return CalibrationArtifact(conformal, calibrators, residuals, point_bias, artifact_metadata)
