import { describe, expect, it } from "vitest";
import { applyAction, scoreFromDimensions, upliftPoints, radarUplift } from "./scoring";
import { scoreToBand } from "./bands";
import type { ScoreSnapshot } from "./types";

const base: ScoreSnapshot = {
  company_id: "COMP_TEST",
  month: "2026-09",
  score: 0, // filled below from dimensions
  band: "B",
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: { bankability: 50, business_profile: 50 },
  dimensions: {
    liquidity: 0.4,
    collections: 0.5,
    payments: 0.4,
    debt: 0.35,
    activity: 0.55,
  },
  peer_percentile: 40,
  projection_6m: { p10: 42, p50: 48, p90: 55 },
  history: [{ month: "2026-09", score: 50 }],
  drivers: [],
  alerts: [],
  explanation: null,
};
base.score = scoreFromDimensions(base.dimensions);
base.band = scoreToBand(base.score);

describe("applyAction", () => {
  const action = {
    recommended_amount: 100_000,
    dimension_deltas: { debt: 0.1, liquidity: 0.05 },
  };

  it("raises the score within 0–100", () => {
    const after = applyAction(base, action);
    expect(after.score).toBeGreaterThan(base.score);
    expect(after.score).toBeLessThanOrEqual(100);
    expect(after.band).toBe(scoreToBand(after.score));
  });

  it("respects floor/ceiling on dimensions", () => {
    const after = applyAction(base, {
      recommended_amount: 100_000,
      dimension_deltas: { debt: 5, liquidity: 5 },
    });
    for (const v of Object.values(after.dimensions)) {
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic (idempotent given same inputs)", () => {
    const a = applyAction(base, action, 100_000);
    const b = applyAction(base, action, 100_000);
    expect(a).toEqual(b);
    expect(upliftPoints(base, a)).toBe(upliftPoints(base, b));
  });

  it("scoreFromDimensions is monotonic in a single dimension", () => {
    const low = scoreFromDimensions({ ...base.dimensions, debt: 0.2 });
    const high = scoreFromDimensions({ ...base.dimensions, debt: 0.8 });
    expect(high).toBeGreaterThan(low);
  });

  it("radarUplift stays non-negative when snapshot.score is the Health Scorer, not the radar", () => {
    const scorer = { ...base, score: 90 };
    const action = { recommended_amount: 100_000, dimension_deltas: { debt: 0.1, liquidity: 0.05 } };
    expect(upliftPoints(scorer, applyAction(scorer, action))).toBeLessThan(0);
    expect(radarUplift(scorer, action)).toBeGreaterThan(0);
  });
});
