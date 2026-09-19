/**
 * In-memory marketplace cache (per serverless instance).
 * Import invalidates by company_id so Eve cannot serve a stale decision.
 */
import type { ProductMatch } from "./types";

export type RecommendCacheEntry = {
  matches: ProductMatch[];
  headline: string;
  source: "eve" | "warm" | "blob" | "engine" | "fallback";
};

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
