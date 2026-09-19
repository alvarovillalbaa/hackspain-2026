"""Correlated residual-block simulation and score propagation."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .forecast import PRIMITIVES


@dataclass(frozen=True)
class ScenarioDistribution:
    scores: pd.DataFrame
    quantiles: dict[int, dict[str, float]]
    threshold_probabilities: dict[int, dict[str, float]]
    largest_uncertainty_source: str

    def to_dict(self) -> dict[str, object]:
        return {
            "quantiles": {str(k): value for k, value in self.quantiles.items()},
            "threshold_probabilities": {
                str(k): value for k, value in self.threshold_probabilities.items()
            },
            "largest_uncertainty_source": self.largest_uncertainty_source,
            "scenario_count": len(self.scores),
        }


class ResidualBlockSimulator:
    """Sample complete OOF residual vectors to retain cross-target/week dependence."""

    def __init__(self, residual_blocks: np.ndarray, *, random_state: int = 17) -> None:
        blocks = np.asarray(residual_blocks, dtype=float)
        if blocks.ndim != 3 or blocks.shape[2] != len(PRIMITIVES):
            raise ValueError(f"residual_blocks must have shape (blocks, weeks, {len(PRIMITIVES)})")
        if not np.isfinite(blocks).all():
            raise ValueError("residual_blocks must be finite")
        self.residual_blocks = blocks
        self.random_state = random_state

    def simulate_ledgers(
        self,
        central_weekly: pd.DataFrame,
        *,
        n_scenarios: int = 1000,
    ) -> np.ndarray:
        if n_scenarios < 100:
            raise ValueError("at least 100 scenarios are required for stable tail estimates")
        central = central_weekly.loc[:, PRIMITIVES].to_numpy(dtype=float)
        weeks = len(central)
        if weeks == 0:
            raise ValueError("central forecast is empty")
        rng = np.random.default_rng(self.random_state)
        choices = rng.integers(0, len(self.residual_blocks), size=n_scenarios)
        output = np.empty((n_scenarios, weeks, len(PRIMITIVES)), dtype=float)
        for i, block_index in enumerate(choices):
            block = self.residual_blocks[block_index]
            if len(block) < weeks:
                repeats = int(np.ceil(weeks / len(block)))
                block = np.tile(block, (repeats, 1))
            output[i] = np.maximum(0.0, central + block[:weeks])
        return output

    def score_distribution(
        self,
        central_weekly: pd.DataFrame,
        *,
        current_score: float,
        score_function: Callable[[pd.DataFrame, int], float],
        horizons: tuple[int, ...] = (30, 90, 180),
        n_scenarios: int = 1000,
    ) -> ScenarioDistribution:
        ledgers = self.simulate_ledgers(central_weekly, n_scenarios=n_scenarios)
        records: list[dict[str, float | int]] = []
        for scenario_id, values in enumerate(ledgers):
            frame = central_weekly.copy()
            frame.loc[:, PRIMITIVES] = values
            for horizon in horizons:
                records.append(
                    {
                        "scenario_id": scenario_id,
                        "horizon_days": horizon,
                        "score": float(np.clip(score_function(frame, horizon), 0, 100)),
                    }
                )
        scores = pd.DataFrame(records)
        quantiles: dict[int, dict[str, float]] = {}
        probabilities: dict[int, dict[str, float]] = {}
        for horizon, group in scores.groupby("horizon_days"):
            values = group["score"]
            quantiles[int(horizon)] = {
                "p10": round(float(values.quantile(0.10)), 2),
                "median": round(float(values.median()), 2),
                "p90": round(float(values.quantile(0.90)), 2),
            }
            probabilities[int(horizon)] = {
                "score_below_40": round(float(values.lt(40).mean()), 4),
                "decline_at_least_15": round(float(values.le(current_score - 15).mean()), 4),
            }
        variances = ledgers.var(axis=(0, 1))
        uncertainty_source = PRIMITIVES[int(np.argmax(variances))]
        return ScenarioDistribution(scores, quantiles, probabilities, uncertainty_source)


def residual_blocks_from_frame(
    residuals: pd.DataFrame,
    *,
    origin_column: str = "origin",
    week_column: str = "week_index",
) -> np.ndarray:
    """Convert complete OOF origin blocks into a dense simulator tensor."""

    missing = {origin_column, week_column, *PRIMITIVES} - set(residuals.columns)
    if missing:
        raise ValueError(f"residual frame is missing columns: {sorted(missing)}")
    lengths = residuals.groupby(origin_column)[week_column].nunique()
    if lengths.empty:
        raise ValueError("no residual blocks supplied")
    required_length = int(lengths.max())
    complete = lengths.loc[lengths.eq(required_length)].index
    blocks = []
    for origin in complete:
        group = residuals.loc[residuals[origin_column].eq(origin)].sort_values(week_column)
        blocks.append(group.loc[:, PRIMITIVES].to_numpy(dtype=float))
    if not blocks:
        raise ValueError("no complete residual blocks supplied")
    return np.stack(blocks)
