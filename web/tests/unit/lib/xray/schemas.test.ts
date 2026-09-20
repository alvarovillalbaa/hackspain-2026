import { describe, expect, it } from "vitest";
import { ScoreSnapshotSchema } from "@/lib/xray/schemas";
import { scoreFromDimensions } from "@/lib/xray/scoring";
import { scoreToBand } from "@/lib/xray/bands";

const dimensions = {
  liquidity: 0.4,
  collections: 0.5,
  payments: 0.4,
  debt: 0.35,
  activity: 0.55,
};
const score = scoreFromDimensions(dimensions);

const valid = {
  company_id: "COMP_TEST",
  month: "2026-08",
  score,
  band: scoreToBand(score),
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: {
    liquidity: 40,
    collections: 50,
    payments: 40,
    debt: 35,
    activity: 55,
  },
  n_signals: 4,
  n_red: 0,
  signals: {
    cash_buffer_days: 10,
    overdue_flow_rate_3m: 0.02,
    dscr_6m: 1.5,
    net_cash_flow_ratio_3m: 0.1,
  },
  dimensions,
  peer_percentile: 40,
  projection_6m: { p10: 42, p50: 48, p90: 55 },
  history: [{ month: "2026-08", score }],
  drivers: [],
  alerts: [],
  explanation: null,
};

describe("ScoreSnapshotSchema", () => {
  it("accepts a complete snapshot", () => {
    const parsed = ScoreSnapshotSchema.parse(valid);
    expect(parsed.company_id).toBe("COMP_TEST");
    expect(parsed.score).toBeGreaterThanOrEqual(0);
    expect(parsed.score).toBeLessThanOrEqual(100);
  });

  it("rejects a missing score", () => {
    const { score: _drop, ...rest } = valid;
    expect(() => ScoreSnapshotSchema.parse(rest)).toThrow();
  });

  it("rejects a non-numeric score", () => {
    expect(() =>
      ScoreSnapshotSchema.parse({ ...valid, score: "hot" })
    ).toThrow();
  });
});
