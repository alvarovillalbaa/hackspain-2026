import { describe, expect, it } from "vitest";
import { deterministicMarketplace } from "@/lib/xray/deterministic-marketplace";
import { leversFromMatch } from "@/lib/xray/negotiation";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";

const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score: 55,
  band: "BB",
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: {
    liquidity: 50,
    collections: 55,
    payments: 50,
    debt: 50,
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
  dimensions: {
    liquidity: 0.4,
    collections: 0.5,
    payments: 0.5,
    debt: 0.35,
    activity: 0.6,
  },
  peer_percentile: 40,
  projection_6m: { p10: 48, p50: 55, p90: 62 },
  history: [{ month: "2026-08", score: 55 }],
  drivers: [],
  alerts: [],
  explanation: null,
  origin: "ml",
};

const action: ActionRecommendation = {
  id: "COMP_0001-refinance-0",
  kind: "refinance",
  title: "Refinanciar",
  rationale: "test",
  recommended_amount: 200_000,
  dimension_deltas: { debt: 0.1, liquidity: 0.02 },
  uplift: 3,
  origin: "deterministic",
};

describe("deterministicMarketplace", () => {
  it("returns ranked products with deterministic origin", () => {
    const matches = deterministicMarketplace(snapshot, action);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.origin === "deterministic")).toBe(true);
    expect(matches[0]!.breakdown.match).toBeGreaterThanOrEqual(
      matches[matches.length - 1]!.breakdown.match
    );
  });

  it("uses catalog product_ids (not ENG_*)", () => {
    const matches = deterministicMarketplace(snapshot, action);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.product.product_id.startsWith("cat_"))).toBe(
      true
    );
    expect(matches.every((m) => !m.product.product_id.startsWith("ENG_"))).toBe(
      true
    );
  });

  it("respects custom amount", () => {
    const matches = deterministicMarketplace(snapshot, action, 150_000);
    expect(matches.every((m) => m.amount === 150_000 || m.amount >= m.product.amount_min)).toBe(
      true
    );
  });
});

describe("leversFromMatch", () => {
  it("builds levers from term gap", () => {
    const [match] = deterministicMarketplace(snapshot, action);
    const levers = leversFromMatch(match!);
    expect(levers.every((l) => l.origin === "deterministic")).toBe(true);
  });
});
