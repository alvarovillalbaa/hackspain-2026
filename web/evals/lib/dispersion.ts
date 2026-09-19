import { CV_ABS_FLOOR, MEAN_NEAR_ZERO } from "./thresholds";

/** Sample standard deviation (n−1). Empty / singleton → 0. */
export function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const ss = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  return Math.sqrt(ss / (values.length - 1));
}

export function mean(values: readonly number[]): number {
  if (!values.length) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Coefficient of variation σ/|μ|.
 * When |μ| < MEAN_NEAR_ZERO, returns absolute half-range / max(1, floor)
 * so a near-zero cluster does not explode the ratio.
 */
export function cv(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const s = stddev(values);
  if (!Number.isFinite(m) || !Number.isFinite(s)) return Number.POSITIVE_INFINITY;
  if (Math.abs(m) < MEAN_NEAR_ZERO) {
    const half = relativeHalfRange(values);
    return half / Math.max(1, CV_ABS_FLOOR);
  }
  return s / Math.abs(m);
}

/** (max − min) / (2 · |mean|), or absolute half-span when mean ≈ 0. */
export function relativeHalfRange(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const m = mean(values);
  if (Math.abs(m) < MEAN_NEAR_ZERO) return span / 2;
  return span / (2 * Math.abs(m));
}

/** Relative error |actual − expected| / max(|expected|, floor). */
export function relErr(actual: number, expected: number, floor = CV_ABS_FLOOR): number {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return Number.POSITIVE_INFINITY;
  }
  const denom = Math.max(Math.abs(expected), floor);
  return Math.abs(actual - expected) / denom;
}

/**
 * Fraction of values equal to the modal value (stringified).
 * 1 = unanimity.
 */
export function modalAgreement(values: readonly unknown[]): {
  agreement: number;
  mode: string | null;
  counts: Record<string, number>;
} {
  if (!values.length) return { agreement: 1, mode: null, counts: {} };
  const counts: Record<string, number> = {};
  for (const v of values) {
    const key = stableKey(v);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  let mode: string | null = null;
  let best = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      mode = k;
    }
  }
  return { agreement: best / values.length, mode, counts };
}

export function isUnanimous(values: readonly unknown[]): boolean {
  return modalAgreement(values).agreement === 1;
}

function stableKey(v: unknown): string {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v)) {
    return `[${v.map(stableKey).join(",")}]`;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${k}:${stableKey(obj[k])}`).join(",")}}`;
  }
  return String(v);
}

/** Passes when CV ≤ maxCv (or half-range absolute when mean ≈ 0). */
export function cvWithin(values: readonly number[], maxCv: number): boolean {
  if (values.length < 2) return true;
  const m = mean(values);
  if (Math.abs(m) < MEAN_NEAR_ZERO) {
    return relativeHalfRange(values) <= maxCv;
  }
  return cv(values) <= maxCv;
}
