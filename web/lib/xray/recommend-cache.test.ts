import { describe, expect, it } from "vitest";
import {
  getRecommendCache,
  invalidateRecommendCache,
  quantityFromDecision,
  recommendCacheKey,
  setRecommendCache,
} from "./recommend-cache";
import type { RecommendationDecision } from "../../agent/lib/schemas";
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

describe("quantityFromDecision", () => {
  it("returns undefined without a decision", () => {
    expect(quantityFromDecision(undefined)).toBeUndefined();
  });

  it("surfaces ceiling_reason and rationale", () => {
    const decision = {
      quantity: {
        company_id: "C",
        action_kind: "refinance",
        ideal_amount: 100_000,
        amount_min: 50_000,
        amount_max: 200_000,
        ceiling_reason: "DSCR caería por debajo de 1,2.",
        rationale: "Suficiente para refinanciar el tramo caro.",
        risks: ["Tipo variable"],
      },
    } as RecommendationDecision;
    expect(quantityFromDecision(decision)).toEqual({
      ceiling_reason: "DSCR caería por debajo de 1,2.",
      rationale: "Suficiente para refinanciar el tramo caro.",
      risks: ["Tipo variable"],
    });
  });
});
