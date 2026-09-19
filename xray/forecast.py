"""Transparent primitive forecast and optional LightGBM residual model."""

from __future__ import annotations

import json
import pickle
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import pandas as pd

from .commitments import CommitmentSchedule, build_commitments
from .features import FeaturePanel, calculate_features
from .ledger import Ledger, LedgerSnapshot
from .scorecard import Scorecard, ScoreResult

PRIMITIVES = (
    "operating_collections",
    "operating_payments",
    "recurring_fixed_outflows",
    "debt_service",
    "interest",
)


@dataclass
class HorizonForecast:
    horizon_days: int
    as_of: str
    target_date: str
    score: ScoreResult
    projected_balance: float
    primitive_totals: dict[str, float]

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["score"] = self.score.to_dict()
        return data


@dataclass
class ForecastResult:
    entity_id: str
    as_of: str
    model_version: str
    weekly_ledger: pd.DataFrame
    commitments: CommitmentSchedule
    horizons: dict[int, HorizonForecast]
    max_source_timestamp: str
    calibration_version: str = "unavailable"
    calibration_status: str = "not_fitted"
    calibration_metadata: dict[str, object] | None = None
    calibrated_medians: dict[int, float] | None = None
    intervals: dict[int, tuple[float, float] | None] | None = None
    threshold_probabilities: dict[int, dict[str, float] | None] | None = None

    def to_dict(self, include_weekly: bool = True) -> dict[str, object]:
        result: dict[str, object] = {
            "entity_id": self.entity_id,
            "as_of": self.as_of,
            "model_version": self.model_version,
            "horizons": {str(k): value.to_dict() for k, value in self.horizons.items()},
            "max_source_timestamp": self.max_source_timestamp,
            "calibration_version": self.calibration_version,
            "calibration_status": self.calibration_status,
            "calibration_metadata": self.calibration_metadata,
            "calibrated_medians": {
                str(horizon): (self.calibrated_medians or {}).get(horizon)
                for horizon in self.horizons
            },
            "intervals": {
                str(horizon): (self.intervals or {}).get(horizon) for horizon in self.horizons
            },
            "threshold_probabilities": {
                str(horizon): (self.threshold_probabilities or {}).get(horizon)
                for horizon in self.horizons
            },
        }
        if include_weekly:
            frame = self.weekly_ledger.copy()
            for column in frame.select_dtypes(include=["datetime", "datetimetz"]).columns:
                frame[column] = frame[column].astype(str)
            result["weekly_ledger"] = frame.to_dict(orient="records")
        return result


class BaselineForecaster:
    """Forecast cash-flow primitives, never the score directly."""

    model_version = "commitment-seasonal-baseline-v1.0"

    def __init__(self, ledger: Ledger, scorecard: Scorecard | None = None) -> None:
        self.ledger = ledger
        self.scorecard = scorecard or Scorecard()

    @staticmethod
    def _historical_weekly(snapshot: LedgerSnapshot) -> pd.DataFrame:
        tx = snapshot.transactions.loc[
            snapshot.transactions["date"].gt(snapshot.as_of - pd.Timedelta(days=365))
        ].copy()
        if tx.empty:
            return pd.DataFrame(columns=PRIMITIVES)
        amount = tx["amount_accounting"]
        tx["primitive"] = np.select(
            [
                tx["category"].eq("debt_repayment") & amount.lt(0),
                tx["category"].eq("interest_charge") & amount.lt(0),
                tx["category"].isin({"salary", "tax", "social_security", "utility", "fee"})
                & amount.lt(0),
                tx["is_operating"] & amount.gt(0),
                tx["is_operating"] & amount.lt(0),
            ],
            [
                "debt_service",
                "interest",
                "recurring_fixed_outflows",
                "operating_collections",
                "operating_payments",
            ],
            default="other",
        )
        tx = tx.loc[tx["primitive"].ne("other")]
        tx["positive_amount"] = tx["amount_accounting"].abs()
        tx["week"] = tx["date"].dt.to_period("W-SUN").dt.start_time
        return tx.pivot_table(
            index="week",
            columns="primitive",
            values="positive_amount",
            aggfunc="sum",
            fill_value=0.0,
        ).reindex(columns=PRIMITIVES, fill_value=0.0)

    @staticmethod
    def _baseline_weekly(history: pd.DataFrame, future_weeks: pd.DatetimeIndex) -> pd.DataFrame:
        baseline = pd.DataFrame(index=future_weeks, columns=PRIMITIVES, dtype=float)
        if history.empty:
            return baseline.fillna(0.0)
        seasonal_key = history.index.month
        recent = history.tail(26)
        for primitive in PRIMITIVES:
            values = history[primitive]
            seasonal = values.groupby(seasonal_key).median()
            robust_level = float(recent[primitive].median())
            x = np.arange(len(recent), dtype=float)
            if len(recent) >= 6:
                low, high = recent[primitive].quantile([0.10, 0.90])
                clipped = recent[primitive].clip(low, high).to_numpy()
                slope = float(np.polyfit(x, clipped, 1)[0])
            else:
                slope = 0.0
            # Trends are damped and cannot move more than 50% of the robust level.
            for i, week in enumerate(future_weeks, start=1):
                level = float(seasonal.get(week.month, robust_level))
                trend = float(np.clip(slope * i, -0.5 * max(level, 1), 0.5 * max(level, 1)))
                baseline.loc[week, primitive] = max(0.0, level + trend)
        return baseline.fillna(0.0)

    @staticmethod
    def _projected_panel(
        current: FeaturePanel,
        weekly: pd.DataFrame,
        horizon_days: int,
        starting_balance: float,
    ) -> FeaturePanel:
        target = pd.Timestamp(current.as_of) + pd.Timedelta(days=horizon_days)
        subset = weekly.loc[weekly["week_start"].le(target)].copy()
        collections = float(subset["operating_collections"].sum())
        payments = float(subset["operating_payments"].sum())
        recurring = float(subset["recurring_fixed_outflows"].sum())
        debt = float(subset["debt_service"].sum())
        interest = float(subset["interest"].sum())
        balance = (
            float(subset.iloc[-1]["closing_balance"]) if not subset.empty else starting_balance
        )
        daily_outflow = (payments + recurring) / max(horizon_days, 1)
        runway = 3650.0 if daily_outflow <= 0 else max(0.0, balance) / daily_outflow
        operating_net = collections - payments - recurring
        margin = operating_net / collections if collections > 0 else None
        debt_coverage = operating_net / (debt + interest) if debt + interest > 0 else None
        values = dict(current.features)

        def projected(name: str, value: float | None, unit: str) -> None:
            old = values[name]
            values[name] = replace(
                old,
                value=None if value is None or not np.isfinite(value) else float(value),
                window_days=horizon_days,
                reliability=min(old.reliability, 0.85),
                unit=unit,
            )

        projected("cash_runway_days", runway, "days")
        projected("worst_deficit_cash_coverage", balance / max(payments + recurring, 1), "multiple")
        projected("operating_cash_margin", margin, "ratio")
        projected("recurring_obligation_coverage", collections / max(recurring, 1), "multiple")
        projected("debt_service_coverage", debt_coverage, "multiple")
        projected("interest_burden", interest / collections if collections > 0 else None, "ratio")
        return FeaturePanel(
            entity_id=current.entity_id,
            as_of=target.isoformat(),
            features=values,
            coverage_flags=current.coverage_flags,
            # A forecast only uses observations available at the original cutoff.
            max_source_timestamp=current.max_source_timestamp,
        )

    def forecast(
        self,
        entity_id: str,
        as_of: str | pd.Timestamp,
        *,
        horizon_days: int = 180,
        score_horizons: tuple[int, ...] = (30, 90, 180),
    ) -> ForecastResult:
        if horizon_days <= 0:
            raise ValueError("horizon_days must be positive")
        horizons = tuple(sorted({h for h in score_horizons if 0 < h <= horizon_days}))
        snapshot = self.ledger.snapshot(entity_id, as_of)
        current_panel = calculate_features(snapshot)
        commitments = build_commitments(self.ledger, snapshot, horizon_days)
        start = (snapshot.as_of + pd.Timedelta(days=1)).normalize()
        future_weeks = pd.date_range(
            start=start, end=snapshot.as_of + pd.Timedelta(days=horizon_days), freq="7D"
        )
        history = self._historical_weekly(snapshot)
        baseline = self._baseline_weekly(history, future_weeks)
        known = pd.DataFrame(0.0, index=future_weeks, columns=PRIMITIVES)
        if not commitments.rows.empty:
            rows = commitments.rows.copy()
            delta = (rows["date"].dt.normalize() - start).dt.days.clip(lower=0)
            rows["week_start"] = start + pd.to_timedelta((delta // 7) * 7, unit="D")
            rows["known_amount"] = rows["amount"].abs()
            pivot = rows.pivot_table(
                index="week_start", columns="primitive", values="known_amount", aggfunc="sum"
            )
            known.update(pivot.reindex(index=future_weeks, columns=PRIMITIVES).fillna(0.0))
        # Known commitments replace, rather than double-count, the corresponding portion.
        uncertain = (baseline - known).clip(lower=0.0)
        totals = known + uncertain
        frame = totals.reset_index(names="week_start")
        frame["known_commitments"] = known.sum(axis=1).to_numpy()
        opening = snapshot.liquid_balance or 0.0
        net = (
            frame["operating_collections"]
            - frame["operating_payments"]
            - frame["recurring_fixed_outflows"]
            - frame["debt_service"]
            - frame["interest"]
        )
        frame["opening_balance"] = opening + net.cumsum().shift(fill_value=0.0)
        frame["net_cashflow"] = net
        frame["closing_balance"] = opening + net.cumsum()
        horizon_results: dict[int, HorizonForecast] = {}
        for horizon in horizons:
            panel = self._projected_panel(current_panel, frame, horizon, opening)
            score = self.scorecard.score(panel)
            subset = frame.loc[frame["week_start"].le(snapshot.as_of + pd.Timedelta(days=horizon))]
            primitive_totals = {
                primitive: round(float(subset[primitive].sum()), 2) for primitive in PRIMITIVES
            }
            projected_balance = (
                float(subset.iloc[-1]["closing_balance"]) if not subset.empty else opening
            )
            horizon_results[horizon] = HorizonForecast(
                horizon_days=horizon,
                as_of=snapshot.as_of.isoformat(),
                target_date=(snapshot.as_of + pd.Timedelta(days=horizon)).isoformat(),
                score=score,
                projected_balance=round(projected_balance, 2),
                primitive_totals=primitive_totals,
            )
        return ForecastResult(
            entity_id=entity_id,
            as_of=snapshot.as_of.isoformat(),
            model_version=self.model_version,
            weekly_ledger=frame,
            commitments=commitments,
            horizons=horizon_results,
            max_source_timestamp=snapshot.max_source_timestamp.isoformat(),
        )


class LightGBMResidualForecaster:
    """Optional direct-horizon residual models with quantile outputs.

    The caller supplies leakage-safe, walk-forward training rows. Raw identifiers and free text
    are rejected so the model cannot learn bank, ERP, country, or entity shortcuts.
    """

    forbidden_predictors: ClassVar[set[str]] = {
        "group_id",
        "company_id",
        "bank",
        "bank_name",
        "erp",
        "country",
        "description",
        "concept",
    }

    def __init__(
        self, quantiles: tuple[float, ...] = (0.1, 0.5, 0.9), random_state: int = 17
    ) -> None:
        self.quantiles = quantiles
        self.random_state = random_state
        self.models: dict[tuple[str, float], Any] = {}
        self.feature_names: list[str] = []
        self.metadata: dict[str, object] = {}

    def fit(
        self, x: pd.DataFrame, residual_targets: pd.DataFrame, *, fold_metadata: dict[str, object]
    ) -> LightGBMResidualForecaster:
        forbidden = self.forbidden_predictors.intersection(x.columns)
        if forbidden:
            raise ValueError(f"Forbidden residual predictors: {sorted(forbidden)}")
        try:
            from lightgbm import LGBMRegressor
        except ImportError as exc:  # pragma: no cover - dependency error is actionable
            raise RuntimeError(
                "Install the declared lightgbm dependency to fit residual models"
            ) from exc
        self.feature_names = list(x.columns)
        for target in residual_targets.columns:
            for quantile in self.quantiles:
                model = LGBMRegressor(
                    objective="quantile",
                    alpha=quantile,
                    n_estimators=250,
                    learning_rate=0.035,
                    num_leaves=15,
                    min_child_samples=30,
                    random_state=self.random_state,
                    verbosity=-1,
                )
                model.fit(x, residual_targets[target])
                self.models[(target, quantile)] = model
        self.metadata = {
            "model_version": "lightgbm-residual-v1.0",
            "folds": fold_metadata,
            "features": self.feature_names,
        }
        return self

    def predict(self, x: pd.DataFrame) -> dict[str, pd.DataFrame]:
        if list(x.columns) != self.feature_names:
            raise ValueError("Prediction columns must exactly match fitted feature columns")
        result: dict[str, pd.DataFrame] = {}
        for (target, quantile), model in self.models.items():
            result.setdefault(target, pd.DataFrame(index=x.index))[f"q{quantile:g}"] = (
                model.predict(x)
            )
        return result

    def save(self, path: str | Path) -> None:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(pickle.dumps(self))
        target.with_suffix(target.suffix + ".json").write_text(
            json.dumps(self.metadata, indent=2), encoding="utf-8"
        )

    @classmethod
    def load(cls, path: str | Path) -> LightGBMResidualForecaster:
        model = pickle.loads(Path(path).read_bytes())
        if not isinstance(model, cls):
            raise TypeError("artifact is not a LightGBMResidualForecaster")
        return model


def attach_uncertainty(
    forecast: ForecastResult,
    scenario_scores: pd.DataFrame,
    *,
    current_score: float,
    conformal_calibrator: Any | None = None,
    probability_calibrators: dict[str, Any] | None = None,
) -> ForecastResult:
    """Attach scenario probabilities and, when supplied, OOF conformal intervals.

    Without fitted calibrators the scenario quantiles are deliberately labelled uncalibrated;
    this function never presents in-sample or heuristic intervals as calibrated.
    """

    required = {"horizon_days", "score"}
    missing = required - set(scenario_scores.columns)
    if missing:
        raise ValueError(f"scenario scores are missing columns: {sorted(missing)}")
    intervals: dict[int, tuple[float, float] | None] = {}
    probabilities: dict[int, dict[str, float] | None] = {}
    calibrators = probability_calibrators or {}
    for horizon in forecast.horizons:
        values = scenario_scores.loc[scenario_scores["horizon_days"].eq(horizon), "score"]
        if values.empty:
            intervals[horizon] = None
            probabilities[horizon] = None
            continue
        median = float(values.median())
        if conformal_calibrator is not None:
            intervals[horizon] = conformal_calibrator.interval(median, horizon)
        else:
            intervals[horizon] = (
                round(float(values.quantile(0.10)), 2),
                round(float(values.quantile(0.90)), 2),
            )
        raw = {
            "score_below_40": float(values.lt(40).mean()),
            "decline_at_least_15": float(values.le(current_score - 15).mean()),
        }
        probabilities[horizon] = {
            event: round(
                float(calibrators[event].predict(probability)[0])
                if event in calibrators
                else probability,
                4,
            )
            for event, probability in raw.items()
        }
    forecast.intervals = intervals
    forecast.threshold_probabilities = probabilities
    if conformal_calibrator is not None and all(
        event in calibrators for event in ("score_below_40", "decline_at_least_15")
    ):
        forecast.calibration_status = "calibrated_out_of_fold"
        forecast.calibration_version = "+".join(
            [
                str(conformal_calibrator.version),
                *(str(calibrators[event].version) for event in sorted(calibrators)),
            ]
        )
    else:
        forecast.calibration_status = "uncalibrated_scenarios"
        forecast.calibration_version = "unavailable"
    return forecast
