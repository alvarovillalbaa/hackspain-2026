/**
 * Legal numeric set for a company: score JSON + fact-pack tool metrics.
 * Used to ground cited figures in Mode A prose (≤2% relative tolerance).
 */
import scoresJson from "../../lib/xray/dataset/scores.json";
import {
  companyMetrics,
  compact,
  num,
  workingCapital,
} from "../../agent/lib/data";
import type { ExportedScore } from "../../lib/xray/dataset/types";
import { REL_ERR_MAX } from "./thresholds";
import { relErr } from "./dispersion";
import type { ExtractedFigure } from "./extract";

const scores = scoresJson as ExportedScore[];
const scoresById = new Map(scores.map((s) => [s.company_id, s] as const));

function addNumber(set: number[], v: unknown): void {
  if (typeof v === "number" && Number.isFinite(v)) {
    set.push(v);
    return;
  }
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) set.push(n);
  }
}

function walk(obj: unknown, into: number[], depth = 0): void {
  if (depth > 6 || obj == null) return;
  if (typeof obj === "number") {
    addNumber(into, obj);
    return;
  }
  if (typeof obj === "string") {
    addNumber(into, obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item, into, depth + 1);
    return;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      walk(v, into, depth + 1);
    }
  }
}

/** All finite numbers a grounded reply may cite for this company. */
export function legalFigures(companyId: string): number[] {
  const out: number[] = [];
  const score = scoresById.get(companyId);
  if (score) walk(score, out);

  const rows = companyMetrics().filter((r) => r.company_id === companyId);
  for (const row of rows) {
    walk(compact(row), out);
  }

  const wc = workingCapital().filter((r) => r.company_id === companyId);
  for (const row of wc) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "company_id" || k === "currency" || k === "month") continue;
      const n = num(v);
      if (n != null && Number.isFinite(n)) out.push(n);
    }
  }

  // Deduplicate with coarse rounding so 62.4 and 62.40 collide.
  const seen = new Set<string>();
  const unique: number[] = [];
  for (const n of out) {
    const key = n.toFixed(6);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(n);
  }
  return unique;
}

export function isGrounded(
  value: number,
  legal: readonly number[],
  tol = REL_ERR_MAX
): boolean {
  if (!legal.length) return false;
  // Exact / near-exact integers often appear as list indices (1, 2, 3) —
  // treat small integers 1–12 as grounded if present OR as section counters.
  if (Number.isInteger(value) && value >= 1 && value <= 12) return true;
  return legal.some((g) => relErr(value, g) <= tol);
}

export interface GroundingReport {
  total: number;
  grounded: number;
  rate: number;
  ungrounded: ExtractedFigure[];
}

export function groundingRate(
  figures: readonly ExtractedFigure[],
  legal: readonly number[],
  tol = REL_ERR_MAX
): GroundingReport {
  const ungrounded: ExtractedFigure[] = [];
  let grounded = 0;
  for (const f of figures) {
    if (isGrounded(f.value, legal, tol)) grounded += 1;
    else ungrounded.push(f);
  }
  const total = figures.length;
  return {
    total,
    grounded,
    rate: total === 0 ? 1 : grounded / total,
    ungrounded,
  };
}
