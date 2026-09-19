/**
 * Agentic calibration thresholds.
 * Continuous fields: CV ≤ 2%. Categoricals at N=8 → unanimity (1/N = 12.5%).
 */
export const CV_MAX = 0.02;
export const REL_ERR_MAX = 0.02;
/** Fraction of cited figures that must ground in the fact pack. */
export const GROUNDING_MIN = 0.98;
/** Absolute floor when |mean| is near zero — CV explodes otherwise. */
export const CV_ABS_FLOOR = 1e-6;
/** Switch from relative CV to absolute half-range when |mean| < this. */
export const MEAN_NEAR_ZERO = 1e-3;

export const DEFAULT_REPS = 8;
export const DEFAULT_CONCURRENCY = 3;

export function calibrationReps(): number {
  const raw = process.env.CALIBRATION_REPS;
  if (raw == null || raw === "") return DEFAULT_REPS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_REPS;
  return Math.min(n, 50);
}

export function calibrationConcurrency(): number {
  const raw = process.env.CALIBRATION_CONCURRENCY;
  if (raw == null || raw === "") return DEFAULT_CONCURRENCY;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY;
  return Math.min(n, 8);
}
