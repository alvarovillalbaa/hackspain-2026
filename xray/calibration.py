"""Out-of-fold conformal intervals and threshold-probability calibration."""

from __future__ import annotations

from dataclasses import dataclass, field

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
