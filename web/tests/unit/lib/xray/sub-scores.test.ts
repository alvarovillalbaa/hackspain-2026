import { describe, expect, it } from "vitest";
import {
  SUB_SCORE_KEYS,
  SUB_SCORE_LABELS,
  subScoresFromDimensions,
} from "@/lib/xray/sub-scores";

describe("subScoresFromDimensions", () => {
  it("maps 0–1 dimensions to 0–100 integers", () => {
    const out = subScoresFromDimensions({
      liquidity: 0.42,
      collections: 0.71,
      payments: 0.385,
      debt: 0,
      activity: 1,
    });
    expect(out).toEqual({
      liquidity: 42,
      collections: 71,
      payments: 39,
      debt: 0,
      activity: 100,
    });
  });

  it("exposes five labeled keys", () => {
    expect(SUB_SCORE_KEYS).toHaveLength(5);
    for (const k of SUB_SCORE_KEYS) {
      expect(SUB_SCORE_LABELS[k]).toBeTruthy();
    }
  });
});
