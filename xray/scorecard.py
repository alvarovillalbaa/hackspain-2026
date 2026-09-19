"""Versioned deterministic feature-to-points transforms and score ledger."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import asdict, dataclass, field

import numpy as np

from .features import FeaturePanel


@dataclass(frozen=True)
class FeatureRule:
    feature: str
    breakpoints: tuple[tuple[float, float], ...]
    weight: float = 1.0
    reason_low: str = ""
    reason_high: str = ""

    def points(self, value: float) -> float:
        ordered = sorted(self.breakpoints)
        x = np.array([point[0] for point in ordered], dtype=float)
        y = np.array([point[1] for point in ordered], dtype=float)
        return float(np.interp(value, x, y, left=y[0], right=y[-1]))


@dataclass(frozen=True)
class ComponentRule:
    name: str
    weight: float
    features: tuple[FeatureRule, ...]


@dataclass(frozen=True)
class ScorecardConfig:
    version: str
    components: tuple[ComponentRule, ...]
    neutral_score: float = 50.0
    bands: tuple[tuple[str, float], ...] = (
        ("critical", 0.0),
        ("vulnerable", 40.0),
        ("stable", 60.0),
        ("strong", 75.0),
    )
    hysteresis_points: float = 3.0


@dataclass(frozen=True)
class PointEntry:
    key: str
    component: str
    raw_value: float | None
    feature_score: float | None
    reliability: float
    contribution: float
    reason_code: str


@dataclass
class ScoreResult:
    entity_id: str
    as_of: str
    score: float
    base_score: float
    momentum_modifier: float
    band: str
    confidence: str
    confidence_score: float
    score_version: str
    component_scores: dict[str, float]
    component_reliability: dict[str, float]
    point_ledger: list[PointEntry]
    top_positive_drivers: list[str] = field(default_factory=list)
    top_negative_drivers: list[str] = field(default_factory=list)
    shock_cap: dict[str, object] | None = None
    max_source_timestamp: str = ""

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["point_ledger_sum"] = round(sum(x.contribution for x in self.point_ledger), 2)
        return data


SCORECARD_V1 = ScorecardConfig(
    version="xray-score-v1.0",
    components=(
        ComponentRule(
            "liquidity",
            0.30,
            (
                FeatureRule(
                    "cash_runway_days",
                    ((0, 0), (15, 20), (30, 40), (60, 65), (120, 85), (180, 100)),
                    reason_low="LOW_CASH_RUNWAY",
                    reason_high="STRONG_CASH_RUNWAY",
                ),
                FeatureRule(
                    "worst_deficit_cash_coverage",
                    ((0, 0), (0.5, 25), (1, 50), (2, 75), (4, 100)),
                    reason_low="CASH_BELOW_DOWNSIDE_NEED",
                    reason_high="DOWNSIDE_BUFFER",
                ),
            ),
        ),
        ComponentRule(
            "cash_generation",
            0.25,
            (
                FeatureRule(
                    "operating_cash_margin",
                    ((-0.4, 0), (-0.15, 20), (0, 50), (0.1, 70), (0.25, 100)),
                    reason_low="NEGATIVE_OPERATING_MARGIN",
                    reason_high="STRONG_OPERATING_MARGIN",
                ),
                FeatureRule(
                    "positive_cashflow_month_fraction",
                    ((0, 0), (0.33, 30), (0.5, 50), (0.75, 75), (1, 100)),
                    reason_low="REPEATED_NEGATIVE_MONTHS",
                    reason_high="CONSISTENT_POSITIVE_MONTHS",
                ),
                FeatureRule(
                    "recurring_obligation_coverage",
                    ((0, 0), (0.75, 25), (1, 50), (1.5, 75), (2.5, 100)),
                    reason_low="RECURRING_COSTS_UNCOVERED",
                    reason_high="RECURRING_COSTS_WELL_COVERED",
                ),
            ),
        ),
        ComponentRule(
            "payment_behaviour",
            0.20,
            (
                FeatureRule(
                    "overdue_receivables_ratio",
                    ((0, 100), (0.1, 80), (0.3, 55), (0.6, 20), (1, 0)),
                    reason_low="OVERDUE_RECEIVABLES",
                    reason_high="RECEIVABLES_CURRENT",
                ),
                FeatureRule(
                    "customer_collection_delay_days",
                    ((0, 100), (7, 85), (20, 60), (45, 30), (90, 0)),
                    reason_low="SLOW_CUSTOMER_COLLECTIONS",
                    reason_high="FAST_CUSTOMER_COLLECTIONS",
                ),
                FeatureRule(
                    "overdue_payables_ratio",
                    ((0, 100), (0.1, 80), (0.3, 55), (0.6, 20), (1, 0)),
                    reason_low="OVERDUE_SUPPLIER_PAYABLES",
                    reason_high="SUPPLIERS_CURRENT",
                ),
                FeatureRule(
                    "supplier_payment_delay_change_days",
                    ((-20, 100), (0, 70), (7, 50), (20, 20), (45, 0)),
                    reason_low="SUPPLIER_DELAY_WORSENING",
                    reason_high="SUPPLIER_DELAY_IMPROVING",
                ),
            ),
        ),
        ComponentRule(
            "debt_capacity",
            0.15,
            (
                FeatureRule(
                    "debt_service_coverage",
                    ((-1, 0), (0, 10), (1, 50), (1.5, 75), (2.5, 100)),
                    reason_low="DEBT_SERVICE_UNCOVERED",
                    reason_high="STRONG_DEBT_SERVICE_COVERAGE",
                ),
                FeatureRule(
                    "interest_burden",
                    ((0, 100), (0.02, 85), (0.05, 65), (0.1, 35), (0.2, 0)),
                    reason_low="HIGH_INTEREST_BURDEN",
                    reason_high="LOW_INTEREST_BURDEN",
                ),
            ),
        ),
        ComponentRule(
            "resilience",
            0.10,
            (
                FeatureRule(
                    "top3_collection_concentration",
                    ((0, 100), (0.3, 85), (0.5, 60), (0.75, 30), (1, 0)),
                    reason_low="CUSTOMER_CONCENTRATION",
                    reason_high="DIVERSIFIED_COLLECTIONS",
                ),
                FeatureRule(
                    "downside_cashflow_volatility",
                    ((0, 100), (0.25, 80), (0.5, 55), (1, 25), (2, 0)),
                    reason_low="VOLATILE_DOWNSIDE_CASHFLOW",
                    reason_high="STABLE_CASHFLOW",
                ),
            ),
        ),
    ),
)


class Scorecard:
    def __init__(self, config: ScorecardConfig = SCORECARD_V1) -> None:
        self.config = config

    def _band(self, score: float, previous_band: str | None = None) -> str:
        bands = list(self.config.bands)
        index = max(i for i, (_, floor) in enumerate(bands) if score >= floor)
        if previous_band is None:
            return bands[index][0]
        previous_index = next(
            (i for i, (name, _) in enumerate(bands) if name == previous_band), index
        )
        if index > previous_index:
            required = bands[index][1] + self.config.hysteresis_points
            return bands[index][0] if score >= required else bands[previous_index][0]
        if index < previous_index:
            previous_floor = bands[previous_index][1] - self.config.hysteresis_points
            return bands[index][0] if score < previous_floor else bands[previous_index][0]
        return bands[index][0]

    @staticmethod
    def _confidence(panel: FeaturePanel) -> tuple[float, str]:
        flags = panel.coverage_flags
        history = min(1.0, float(flags.get("history_days", 0)) / 180)
        score = (
            0.35 * float(bool(flags.get("transactions")))
            + 0.25 * float(bool(flags.get("reconstructable_balance")))
            + 0.20 * history
            + 0.15 * float(bool(flags.get("invoices")))
            + 0.05 * float(bool(flags.get("debt_schedule")))
        )
        grade = "A" if score >= 0.85 else "B" if score >= 0.65 else "C" if score >= 0.40 else "D"
        return round(score, 3), grade

    def _unmodified_score(self, panel: FeaturePanel) -> float:
        total = 0.0
        for component in self.config.components:
            rules = component.features
            observed = [
                (rule, panel.features.get(rule.feature))
                for rule in rules
                if panel.features.get(rule.feature) is not None
                and panel.features[rule.feature].value is not None
            ]
            weighted = sum(rule.weight * value.reliability for rule, value in observed)
            reliability = min(1.0, weighted / sum(rule.weight for rule in rules))
            if weighted:
                raw = (
                    sum(
                        rule.points(float(value.value)) * rule.weight * value.reliability
                        for rule, value in observed
                    )
                    / weighted
                )
            else:
                raw = self.config.neutral_score
            adjusted = reliability * raw + (1 - reliability) * self.config.neutral_score
            total += component.weight * adjusted
        return total

    def _momentum(
        self, panel: FeaturePanel, history: Iterable[FeaturePanel]
    ) -> tuple[float, dict[str, object] | None]:
        prior = sorted(
            (item for item in history if item.as_of < panel.as_of), key=lambda x: x.as_of
        )
        if not prior:
            return 0.0, None
        scores = [self._unmodified_score(item) for item in prior[-3:]] + [
            self._unmodified_score(panel)
        ]
        changes = np.diff(scores)
        robust_change = float(np.median(changes[-2:])) if len(changes) >= 2 else float(changes[-1])
        breadth_values: list[float] = []
        previous = prior[-1]
        for component in self.config.components:
            component_changes = []
            for rule in component.features:
                now = panel.features.get(rule.feature)
                then = previous.features.get(rule.feature)
                if now and then and now.value is not None and then.value is not None:
                    component_changes.append(rule.points(now.value) - rule.points(then.value))
            if component_changes:
                breadth_values.append(float(np.mean(component_changes)))
        breadth = float(np.mean(breadth_values)) if breadth_values else 0.0
        proposed = float(np.clip(0.55 * robust_change + 0.10 * breadth, -10, 10))
        persistent = len(changes) >= 2 and np.sign(changes[-1]) == np.sign(changes[-2])
        runway = panel.features.get("cash_runway_days")
        hard_liquidity_breach = (
            runway is not None and runway.value is not None and runway.value < 15
        )
        cap = None
        if not persistent and not hard_liquidity_breach and abs(proposed) > 4:
            applied = float(np.clip(proposed, -4, 4))
            cap = {
                "applied": True,
                "uncapped_modifier": round(proposed, 4),
                "cap": 4.0,
                "reason": "one-period movement without persistence",
            }
            proposed = applied
        return round(proposed, 4), cap

    def score(
        self,
        panel: FeaturePanel,
        *,
        history: Iterable[FeaturePanel] = (),
        previous_band: str | None = None,
    ) -> ScoreResult:
        entries: list[PointEntry] = []
        components: dict[str, float] = {}
        component_reliability: dict[str, float] = {}
        base_score = 0.0
        for component in self.config.components:
            denominator = sum(rule.weight for rule in component.features)
            observed_weight = 0.0
            observed_points = 0.0
            for rule in component.features:
                feature = panel.features.get(rule.feature)
                if feature is None or feature.value is None:
                    reliability = 0.0
                    feature_score = None
                    contribution = 0.0
                    reason = f"{rule.feature.upper()}_UNAVAILABLE"
                    raw_value = None
                else:
                    reliability = feature.reliability
                    feature_score = rule.points(feature.value)
                    observed_weight += rule.weight * reliability
                    observed_points += feature_score * rule.weight * reliability
                    contribution = (
                        component.weight * feature_score * rule.weight * reliability / denominator
                    )
                    reason = (
                        rule.reason_high
                        if feature_score >= 65
                        else rule.reason_low
                        if feature_score < 40
                        else "NEUTRAL"
                    )
                    raw_value = feature.value
                entries.append(
                    PointEntry(
                        key=rule.feature,
                        component=component.name,
                        raw_value=raw_value,
                        feature_score=None if feature_score is None else round(feature_score, 4),
                        reliability=round(reliability, 4),
                        contribution=round(contribution, 6),
                        reason_code=reason,
                    )
                )
            reliability = min(1.0, observed_weight / denominator)
            raw_component = (
                observed_points / observed_weight if observed_weight else self.config.neutral_score
            )
            adjusted = reliability * raw_component + (1 - reliability) * self.config.neutral_score
            neutral_contribution = component.weight * self.config.neutral_score * (1 - reliability)
            entries.append(
                PointEntry(
                    key=f"{component.name}_missing_data_neutral",
                    component=component.name,
                    raw_value=None,
                    feature_score=self.config.neutral_score,
                    reliability=round(1 - reliability, 4),
                    contribution=round(neutral_contribution, 6),
                    reason_code="MISSING_DATA_NEUTRAL_SHRINKAGE"
                    if reliability < 1
                    else "NO_SHRINKAGE",
                )
            )
            components[component.name] = round(adjusted, 2)
            component_reliability[component.name] = round(reliability, 3)
            base_score += component.weight * adjusted

        modifier, shock_cap = self._momentum(panel, history)
        entries.append(
            PointEntry(
                key="momentum_modifier",
                component="momentum",
                raw_value=modifier,
                feature_score=None,
                reliability=1.0,
                contribution=modifier,
                reason_code="MOMENTUM_POSITIVE"
                if modifier > 0
                else "MOMENTUM_NEGATIVE"
                if modifier < 0
                else "NO_MOMENTUM",
            )
        )
        unclamped = base_score + modifier
        final_score = float(np.clip(unclamped, 0, 100))
        if final_score != unclamped:
            entries.append(
                PointEntry(
                    key="score_boundary_adjustment",
                    component="boundary",
                    raw_value=None,
                    feature_score=None,
                    reliability=1.0,
                    contribution=final_score - unclamped,
                    reason_code="SCORE_CLAMPED_TO_0_100",
                )
            )
        displayed = round(final_score, 2)
        ledger_sum = sum(item.contribution for item in entries)
        if round(ledger_sum, 2) != displayed:
            entries.append(
                PointEntry(
                    key="display_rounding",
                    component="rounding",
                    raw_value=None,
                    feature_score=None,
                    reliability=1.0,
                    contribution=round(displayed - ledger_sum, 6),
                    reason_code="DISPLAY_ROUNDING",
                )
            )
        confidence_score, confidence = self._confidence(panel)
        drivers = [
            entry
            for entry in entries
            if not entry.key.endswith("neutral")
            and entry.component not in {"momentum", "rounding", "boundary"}
        ]
        positive = sorted(
            (
                item
                for item in drivers
                if item.feature_score is not None and item.feature_score > self.config.neutral_score
            ),
            key=lambda item: float(item.feature_score) - self.config.neutral_score,
            reverse=True,
        )[:3]
        negative = sorted(
            (
                item
                for item in drivers
                if item.feature_score is not None and item.feature_score < self.config.neutral_score
            ),
            key=lambda item: item.feature_score if item.feature_score is not None else 50,
        )[:3]
        return ScoreResult(
            entity_id=panel.entity_id,
            as_of=panel.as_of,
            score=displayed,
            base_score=round(base_score, 2),
            momentum_modifier=modifier,
            band=self._band(displayed, previous_band),
            confidence=confidence,
            confidence_score=confidence_score,
            score_version=self.config.version,
            component_scores=components,
            component_reliability=component_reliability,
            point_ledger=entries,
            top_positive_drivers=[
                item.reason_code for item in positive if item.reason_code != "NEUTRAL"
            ],
            top_negative_drivers=[
                item.reason_code for item in negative if item.reason_code != "NEUTRAL"
            ],
            shock_cap=shock_cap,
            max_source_timestamp=panel.max_source_timestamp,
        )

    def next_band_target(self, result: ScoreResult) -> float | None:
        bands = list(self.config.bands)
        index = next(i for i, (name, _) in enumerate(bands) if name == result.band)
        return (
            None if index == len(bands) - 1 else bands[index + 1][1] + self.config.hysteresis_points
        )
