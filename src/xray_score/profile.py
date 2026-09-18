from __future__ import annotations

import bisect
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path

import polars as pl

from .config import FEATURES, QUANTILE_COUNT


@dataclass(frozen=True)
class FeatureProfile:
    quantiles: list[float]


@dataclass(frozen=True)
class ScoreProfile:
    version: int
    features: dict[str, FeatureProfile]

    @classmethod
    def fit(cls, frame: pl.DataFrame) -> "ScoreProfile":
        feature_profiles: dict[str, FeatureProfile] = {}
        probabilities = [index / (QUANTILE_COUNT - 1) for index in range(QUANTILE_COUNT)]

        for definition in FEATURES:
            values = frame.get_column(definition.name).drop_nulls()
            values = values.filter(values.is_finite()).round(10)
            if values.is_empty():
                raise ValueError(f"Cannot fit score profile: {definition.name} has no values")
            quantiles = [
                round(float(values.quantile(probability, interpolation="linear")), 10)
                for probability in probabilities
            ]
            feature_profiles[definition.name] = FeatureProfile(quantiles=quantiles)

        return cls(version=1, features=feature_profiles)

    def percentile(self, feature_name: str, value: float | None) -> float | None:
        if value is None or not math.isfinite(value):
            return None
        value = round(value, 10)
        quantiles = self.features[feature_name].quantiles
        insertion = bisect.bisect_left(quantiles, value)
        if insertion < len(quantiles) and quantiles[insertion] == value:
            duplicate_end = bisect.bisect_right(quantiles, value)
            midrank = (insertion + duplicate_end - 1) / 2.0
            return 100.0 * midrank / (len(quantiles) - 1)
        if insertion <= 0:
            return 0.0
        if insertion >= len(quantiles):
            return 100.0

        left = insertion - 1
        right = insertion
        low = quantiles[left]
        high = quantiles[right]
        fraction = (value - low) / (high - low)
        return 100.0 * (left + fraction) / (len(quantiles) - 1)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": self.version,
            "features": {name: asdict(profile) for name, profile in self.features.items()},
        }
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "ScoreProfile":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            version=int(payload["version"]),
            features={
                name: FeatureProfile(quantiles=[float(value) for value in profile["quantiles"]])
                for name, profile in payload["features"].items()
            },
        )
