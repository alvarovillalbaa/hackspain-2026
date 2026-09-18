from __future__ import annotations

import json

import polars as pl

from .config import (
    EWMA_ALPHA,
    FEATURES,
    MAX_MOMENTUM_ADJUSTMENT,
    MOMENTUM_MULTIPLIER,
    NEUTRAL_PERCENTILE,
    PERSISTENT_MOMENTUM_THRESHOLD,
    PERSISTENT_PRIOR_MOMENTUM_THRESHOLD,
    PILLAR_LABELS,
    SUDDEN_CHANGE_THRESHOLD,
)
from .profile import ScoreProfile


def _percentile_expression(profile: ScoreProfile, feature_name: str) -> pl.Expr:
    return pl.col(feature_name).map_elements(
        lambda value: profile.percentile(feature_name, value),
        return_dtype=pl.Float64,
        skip_nulls=True,
    )


def _driver_explanations(frame: pl.DataFrame) -> tuple[list[str], list[str]]:
    driver_json: list[str] = []
    explanation_text: list[str] = []
    labels = {definition.name: definition.label for definition in FEATURES}

    for row in frame.iter_rows(named=True):
        contributions = [
            (labels[definition.name], float(row[f"delta_component__{definition.name}"] or 0.0))
            for definition in FEATURES
        ]
        contributions.append(("trajectory", float(row["momentum_delta"] or 0.0)))
        contributions.append(("score boundary", float(row["boundary_adjustment_delta"] or 0.0)))
        non_zero = [item for item in contributions if abs(item[1]) >= 0.01]
        top = sorted(non_zero, key=lambda item: abs(item[1]), reverse=True)[:3]
        payload = [
            {
                "driver": label,
                "contribution": round(value, 2),
                "direction": "positive" if value > 0 else "negative",
            }
            for label, value in top
        ]
        driver_json.append(json.dumps(payload, separators=(",", ":")))

        change = float(row["score_change"] or 0.0)
        if not top:
            explanation_text.append("No material score movement.")
            continue
        rendered = ", ".join(f"{label} {value:+.1f}" for label, value in top)
        explanation_text.append(f"Score changed {change:+.1f} points: {rendered}.")

    return driver_json, explanation_text


def apply_score(features: pl.DataFrame, profile: ScoreProfile) -> pl.DataFrame:
    frame = features.sort("company_id", "month")

    percentile_expressions: list[pl.Expr] = []
    for definition in FEATURES:
        expression = _percentile_expression(profile, definition.name)
        if not definition.higher_is_better:
            expression = 100.0 - expression
        percentile_expressions.append(expression.alias(f"percentile__{definition.name}"))
    frame = frame.with_columns(percentile_expressions)

    frame = frame.with_columns(
        [
            pl.col(f"percentile__{definition.name}")
            .fill_null(NEUTRAL_PERCENTILE)
            .mul(definition.weight)
            .alias(f"component__{definition.name}")
            for definition in FEATURES
        ]
        + [
            pl.when(pl.col(definition.name).is_not_null())
            .then(definition.weight)
            .otherwise(0.0)
            .alias(f"observed_weight__{definition.name}")
            for definition in FEATURES
        ]
    )

    frame = frame.with_columns(
        [
            pl.col(f"component__{definition.name}")
            .ewm_mean(alpha=EWMA_ALPHA, adjust=False)
            .over("company_id")
            .alias(f"state_component__{definition.name}")
            for definition in FEATURES
        ]
    )

    raw_score = pl.sum_horizontal(
        [pl.col(f"component__{definition.name}") for definition in FEATURES]
    )
    state_score = pl.sum_horizontal(
        [pl.col(f"state_component__{definition.name}") for definition in FEATURES]
    )
    observed_weight = pl.sum_horizontal(
        [pl.col(f"observed_weight__{definition.name}") for definition in FEATURES]
    )
    frame = frame.with_columns(
        raw_score.alias("raw_score"),
        state_score.alias("state_score"),
        observed_weight.alias("observed_feature_weight"),
    )

    frame = frame.with_columns(
        pl.col("raw_score")
        .rolling_mean(window_size=3, min_samples=1)
        .over("company_id")
        .alias("recent_raw_score_3m"),
        pl.col("raw_score")
        .shift(3)
        .rolling_mean(window_size=3, min_samples=1)
        .over("company_id")
        .alias("previous_raw_score_3m"),
    ).with_columns(
        (
            (pl.col("recent_raw_score_3m") - pl.col("previous_raw_score_3m"))
            * MOMENTUM_MULTIPLIER
        )
        .fill_null(0.0)
        .clip(-MAX_MOMENTUM_ADJUSTMENT, MAX_MOMENTUM_ADJUSTMENT)
        .alias("momentum_adjustment")
    )

    frame = frame.with_columns(
        (pl.col("state_score") + pl.col("momentum_adjustment")).alias("unbounded_score")
    ).with_columns(
        pl.col("unbounded_score").clip(0.0, 100.0).alias("score"),
        (pl.col("unbounded_score").clip(0.0, 100.0) - pl.col("unbounded_score")).alias(
            "boundary_adjustment"
        ),
    )

    frame = frame.with_columns(
        [
            pl.col("score").diff().over("company_id").fill_null(0.0).alias("score_change"),
            pl.col("momentum_adjustment")
            .diff()
            .over("company_id")
            .fill_null(0.0)
            .alias("momentum_delta"),
            pl.col("boundary_adjustment")
            .diff()
            .over("company_id")
            .fill_null(0.0)
            .alias("boundary_adjustment_delta"),
        ]
        + [
            pl.col(f"state_component__{definition.name}")
            .diff()
            .over("company_id")
            .fill_null(0.0)
            .alias(f"delta_component__{definition.name}")
            for definition in FEATURES
        ]
    )

    pillar_expressions: list[pl.Expr] = []
    for pillar in PILLAR_LABELS:
        definitions = [definition for definition in FEATURES if definition.pillar == pillar]
        pillar_weight = sum(definition.weight for definition in definitions)
        pillar_expressions.append(
            (
                pl.sum_horizontal(
                    [pl.col(f"state_component__{definition.name}") for definition in definitions]
                )
                / pillar_weight
            ).alias(f"pillar__{pillar}")
        )
    frame = frame.with_columns(pillar_expressions)

    history_factor = (pl.col("history_months") / 6.0).clip(0.0, 1.0)
    source_confidence = (
        0.35 * history_factor
        + 0.20 * pl.col("category_coverage_3m")
        + 0.15 * pl.col("counterparty_coverage_3m")
        + 0.15 * pl.col("final_liquid_cash").is_not_null().cast(pl.Float64)
        + 0.15 * pl.col("has_invoice_source").cast(pl.Float64)
    )
    frame = frame.with_columns(
        (
            100.0
            * (0.70 * source_confidence + 0.30 * pl.col("observed_feature_weight"))
        )
        .clip(0.0, 100.0)
        .alias("confidence")
    )

    frame = frame.with_columns(
        pl.col("momentum_adjustment")
        .shift(1)
        .over("company_id")
        .fill_null(0.0)
        .alias("prior_momentum_adjustment")
    )
    frame = frame.with_columns(
        pl.when(
            (pl.col("history_months") >= 6)
            & (pl.col("score_change") >= SUDDEN_CHANGE_THRESHOLD)
        )
        .then(pl.lit("sudden improvement"))
        .when(
            (pl.col("history_months") >= 6)
            & (pl.col("score_change") <= -SUDDEN_CHANGE_THRESHOLD)
        )
        .then(pl.lit("sudden deterioration"))
        .when(pl.col("momentum_adjustment") >= 3.0)
        .then(pl.lit("improving"))
        .when(pl.col("momentum_adjustment") <= -3.0)
        .then(pl.lit("deteriorating"))
        .otherwise(pl.lit("stable"))
        .alias("status"),
        pl.when(
            (pl.col("history_months") >= 6)
            & (pl.col("score_change") >= SUDDEN_CHANGE_THRESHOLD)
        )
        .then(pl.lit("sudden_improvement"))
        .when(
            (pl.col("history_months") >= 6)
            & (pl.col("score_change") <= -SUDDEN_CHANGE_THRESHOLD)
        )
        .then(pl.lit("sudden_deterioration"))
        .when(
            (pl.col("history_months") >= 6)
            & (pl.col("momentum_adjustment") >= PERSISTENT_MOMENTUM_THRESHOLD)
            & (
                pl.col("prior_momentum_adjustment")
                >= PERSISTENT_PRIOR_MOMENTUM_THRESHOLD
            )
            & (pl.col("score_change") > 0)
        )
        .then(pl.lit("persistent_improvement"))
        .when(
            (pl.col("history_months") >= 6)
            & (pl.col("momentum_adjustment") <= -PERSISTENT_MOMENTUM_THRESHOLD)
            & (
                pl.col("prior_momentum_adjustment")
                <= -PERSISTENT_PRIOR_MOMENTUM_THRESHOLD
            )
            & (pl.col("score_change") < 0)
        )
        .then(pl.lit("persistent_deterioration"))
        .otherwise(pl.lit(None, dtype=pl.String))
        .alias("alert"),
    )

    driver_json, explanation_text = _driver_explanations(frame)
    return frame.with_columns(
        pl.Series("top_drivers", driver_json),
        pl.Series("explanation", explanation_text),
    )


def aggregate_groups(company_scores: pl.DataFrame) -> pl.DataFrame:
    pillar_columns = [f"pillar__{pillar}" for pillar in PILLAR_LABELS]
    frame = company_scores.with_columns(
        pl.col("operating_inflow_3m").clip(lower_bound=1.0).alias("group_weight")
    )

    aggregations: list[pl.Expr] = [
        ((pl.col("score") * pl.col("group_weight")).sum() / pl.col("group_weight").sum()).alias(
            "score"
        ),
        (
            (pl.col("confidence") * pl.col("group_weight")).sum()
            / pl.col("group_weight").sum()
        ).alias("confidence"),
        pl.col("score").min().alias("weakest_company_score"),
        pl.col("company_id").sort_by("score").first().alias("weakest_company_id"),
        pl.col("company_id").n_unique().alias("company_count"),
        pl.col("operating_inflow_3m").sum().alias("operating_inflow_3m"),
    ]
    aggregations.extend(
        (
            (pl.col(column) * pl.col("group_weight")).sum() / pl.col("group_weight").sum()
        ).alias(column)
        for column in pillar_columns
    )

    groups = (
        frame.group_by("group_id", "month")
        .agg(aggregations)
        .sort("group_id", "month")
        .with_columns(
            pl.col("score").diff().over("group_id").fill_null(0.0).alias("score_change")
        )
        .with_columns(
            pl.when(pl.col("score_change") >= SUDDEN_CHANGE_THRESHOLD)
            .then(pl.lit("sudden improvement"))
            .when(pl.col("score_change") <= -SUDDEN_CHANGE_THRESHOLD)
            .then(pl.lit("sudden deterioration"))
            .when(pl.col("score_change") >= 2.0)
            .then(pl.lit("improving"))
            .when(pl.col("score_change") <= -2.0)
            .then(pl.lit("deteriorating"))
            .otherwise(pl.lit("stable"))
            .alias("status"),
            pl.when(pl.col("score_change") >= SUDDEN_CHANGE_THRESHOLD)
            .then(pl.lit("sudden_improvement"))
            .when(pl.col("score_change") <= -SUDDEN_CHANGE_THRESHOLD)
            .then(pl.lit("sudden_deterioration"))
            .otherwise(pl.lit(None, dtype=pl.String))
            .alias("alert"),
        )
    )
    return groups
