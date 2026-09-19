/**
 * In-memory marketplace cache (per serverless instance).
 * Import invalidates by company_id so Eve cannot serve a stale decision.
 */
import type { RecommendationDecision } from "../../agent/lib/schemas";
import type { ProductMatch } from "./types";

export type QuantitySummary = {
  ceiling_reason: string;
  rationale: string;
  risks: string[];
};

export type RecommendCacheEntry = {
  matches: ProductMatch[];
  headline: string;
  source: "eve" | "warm" | "blob" | "engine" | "fallback";
  decision?: RecommendationDecision;
};

export function quantityFromDecision(
  decision?: RecommendationDecision
): QuantitySummary | undefined {
  if (!decision?.quantity) return undefined;
  return {
    ceiling_reason: decision.quantity.ceiling_reason,
    rationale: decision.quantity.rationale,
    risks: decision.quantity.risks ?? [],
  };
}

const memory = new Map<string, RecommendCacheEntry>();

export function recommendCacheKey(
  companyId: string,
  actionId: string,
  amount?: number
): string {
  return `${companyId}:${actionId}:${amount ?? "auto"}`;
}

export function getRecommendCache(
  key: string
): RecommendCacheEntry | undefined {
  return memory.get(key);
}

export function setRecommendCache(
  key: string,
  entry: RecommendCacheEntry
): void {
  memory.set(key, entry);
}

export function invalidateRecommendCache(companyId: string): number {
  let n = 0;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(`${companyId}:`)) {
      memory.delete(key);
      n += 1;
    }
  }
  return n;
}

/** Latest Eve/blob decision for this company+action, regardless of amount key. */
export function getCachedDecision(
  companyId: string,
  actionId: string
): RecommendationDecision | undefined {
  const prefix = `${companyId}:${actionId}:`;
  for (const [key, entry] of memory) {
    if (key.startsWith(prefix) && entry.decision) return entry.decision;
  }
  return undefined;
}
