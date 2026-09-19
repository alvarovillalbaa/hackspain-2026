import { scoreToBand } from "./bands";
import type {
  ActionRecommendation,
  DimensionDeltas,
  Dimensions,
  ScoreSnapshot,
} from "./types";

const DIMENSION_WEIGHTS: Record<keyof Dimensions, number> = {
  liquidity: 0.28,
  collections: 0.18,
  payments: 0.18,
  debt: 0.26,
  activity: 0.1,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Recompose 0–100 score from dimension vector (deterministic). */
export function scoreFromDimensions(dimensions: Dimensions): number {
  let total = 0;
  for (const key of Object.keys(DIMENSION_WEIGHTS) as (keyof Dimensions)[]) {
    total += clamp01(dimensions[key]) * DIMENSION_WEIGHTS[key] * 100;
  }
  return Math.round(total * 10) / 10;
}

function scaleDeltas(
  deltas: DimensionDeltas,
  amount: number,
  recommended: number
): DimensionDeltas {
  const factor = recommended > 0 ? Math.min(1.5, amount / recommended) : 1;
  const out: DimensionDeltas = {};
  for (const [k, v] of Object.entries(deltas) as [keyof DimensionDeltas, number | undefined][]) {
    if (v != null) out[k] = v * factor;
  }
  return out;
}

/**
 * Apply an action (or product) to a score snapshot.
 * Same function feeds action-card uplift and product-card uplift.
 */
export function applyAction(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  amount?: number
): ScoreSnapshot {
  const amt = amount ?? action.recommended_amount;
  const deltas = scaleDeltas(action.dimension_deltas, amt, action.recommended_amount);

  const dimensions: Dimensions = { ...snapshot.dimensions };
  for (const [k, v] of Object.entries(deltas) as [keyof Dimensions, number | undefined][]) {
    if (v != null) dimensions[k] = clamp01(dimensions[k] + v);
  }

  const score = scoreFromDimensions(dimensions);
  const band = scoreToBand(score);
  const bankability = Math.round(
    (dimensions.liquidity * 0.4 + dimensions.debt * 0.35 + dimensions.payments * 0.25) * 100
  );
  const business_profile = Math.round(
    (dimensions.collections * 0.45 + dimensions.activity * 0.55) * 100
  );

  const delta = score - snapshot.score;
  const projection_6m = {
    p10: clampScore(snapshot.projection_6m.p10 + delta * 0.7),
    p50: clampScore(snapshot.projection_6m.p50 + delta),
    p90: clampScore(snapshot.projection_6m.p90 + delta * 1.1),
  };

  return {
    ...snapshot,
    score,
    band,
    sub_scores: { bankability, business_profile },
    dimensions,
    projection_6m,
    origin: "deterministic",
  };
}

export function upliftPoints(
  before: ScoreSnapshot,
  after: ScoreSnapshot
): number {
  return Math.round((after.score - before.score) * 10) / 10;
}

/**
 * Uplift of the radar what-if, not vs the Health Scorer number.
 * Dataset snapshots have score from xray (0–100 isotonic) while applyAction
 * recomposes from dimensions; subtracting those two produced fake negative pts.
 */
export function radarUplift(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  amount?: number
): number {
  const baseline: ScoreSnapshot = {
    ...snapshot,
    score: scoreFromDimensions(snapshot.dimensions),
  };
  return upliftPoints(baseline, applyAction(baseline, action, amount));
}
