import { describe, expect, it } from "vitest";
import {
  getRecommendCache,
  invalidateRecommendCache,
  recommendCacheKey,
  setRecommendCache,
} from "./recommend-cache";
import type { ProductMatch } from "./types";

const stub = {
  matches: [] as ProductMatch[],
  headline: "x",
  source: "warm" as const,
};

describe("recommend-cache", () => {
  it("invalidates every key for one company and leaves others", () => {
    setRecommendCache(recommendCacheKey("COMP_0001", "a1"), stub);
    setRecommendCache(recommendCacheKey("COMP_0001", "a2", 1000), stub);
    setRecommendCache(recommendCacheKey("COMP_0002", "a1"), stub);

    expect(invalidateRecommendCache("COMP_0001")).toBe(2);
    expect(getRecommendCache(recommendCacheKey("COMP_0001", "a1"))).toBeUndefined();
    expect(
      getRecommendCache(recommendCacheKey("COMP_0001", "a2", 1000))
    ).toBeUndefined();
    expect(getRecommendCache(recommendCacheKey("COMP_0002", "a1"))).toEqual(stub);
  });
});
