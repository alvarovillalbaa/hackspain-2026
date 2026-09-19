import { scoreToBand } from "./bands";
import { subScoresFromDimensions } from "./sub-scores";
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
    sub_scores: subScoresFromDimensions(dimensions),
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

export function radarBaseline(snapshot: ScoreSnapshot): ScoreSnapshot {
  return { ...snapshot, score: scoreFromDimensions(snapshot.dimensions) };
}

/** Radar what-if: before/after 0–100 from dimensions, not vs the Health Scorer. */
export function radarProjection(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  amount?: number
): { before: number; after: number; uplift: number; toBand: ScoreSnapshot["band"] } {
  const baseline = radarBaseline(snapshot);
  const next = applyAction(baseline, action, amount);
  return {
    before: baseline.score,
    after: next.score,
    uplift: upliftPoints(baseline, next),
    toBand: next.band,
  };
}

export function radarUplift(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  amount?: number
): number {
  return radarProjection(snapshot, action, amount).uplift;
}

export type ScoreProjection = {
  before: number;
  after: number;
  uplift: number;
  toBand: ScoreSnapshot["band"];
};

/**
 * What-if on the published Health Score.
 * ponytail: ceiling = add radar dimension-points onto the isotonic 0–100;
 * upgrade = re-run xray.score with shocked facts.
 */
export function publishedProjection(
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  amount?: number
): ScoreProjection {
  return shiftPublished(snapshot, radarUplift(snapshot, action, amount));
}

export function publishedProjectionMany(
  snapshot: ScoreSnapshot,
  actions: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">[]
): ScoreProjection {
  let radar = radarBaseline(snapshot);
  const start = radar.score;
  for (const a of actions) {
    radar = applyAction(radar, a, a.recommended_amount);
  }
  return shiftPublished(snapshot, Math.round((radar.score - start) * 10) / 10);
}

function shiftPublished(snapshot: ScoreSnapshot, uplift: number): ScoreProjection {
  const before = snapshot.score;
  const after = clampScore(before + uplift);
  return { before, after, uplift, toBand: scoreToBand(after) };
}
