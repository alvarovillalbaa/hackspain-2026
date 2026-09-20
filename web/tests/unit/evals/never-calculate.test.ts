/**
 * Never-calculate eval: the server owns match figures. Reassembly is
 * deterministic and never invents catalog product_ids.
 */
import { describe, expect, it } from "vitest";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { reassembleMatches } from "@/lib/xray/reassemble";
import { scoreFromDimensions } from "@/lib/xray/scoring";
import { scoreToBand } from "@/lib/xray/bands";
import type { ScoreSnapshot } from "@/lib/xray/types";

const dims = {
  liquidity: 0.42,
  collections: 0.71,
  payments: 0.38,
  debt: 0.35,
  activity: 0.62,
};
const score = scoreFromDimensions(dims);
const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score,
  band: scoreToBand(score),
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: {
    liquidity: 42,
    collections: 71,
    payments: 38,
    debt: 35,
    activity: 62,
  },
  n_signals: 4,
  n_red: 0,
  signals: {
    cash_buffer_days: 18,
    overdue_flow_rate_3m: 0.04,
    dscr_6m: 1.4,
    net_cash_flow_ratio_3m: 0.08,
  },
  dimensions: dims,
  peer_percentile: 55,
  projection_6m: { p10: score - 5, p50: score, p90: score + 5 },
  history: [{ month: "2026-08", score }],
  drivers: [],
  alerts: [],
  explanation: null,
};

const decision = RecommendationDecisionSchema.parse({
  company_id: "COMP_0001",
  action_id: "COMP_0001-refinance-0",
  action_kind: "refinance",
  quantity: {
    company_id: "COMP_0001",
    action_kind: "refinance",
    ideal_amount: 350_000,
    reasoning: "Enough to refinance without idle cash; DSCR floor holds",
    risks: [],
  },
  terms: [
    {
      product_id: "cat_bbva_refi",
      amount: 350_000,
      interest_rate: 0.045,
      start_date: "2026-09-01",
      end_date: "2030-09-01",
    },
    {
      product_id: "cat_embat_refi",
      amount: 350_000,
      interest_rate: 0.062,
      start_date: "2026-09-01",
      end_date: "2029-09-01",
    },
  ],
  ranking: [
    { product_id: "cat_bbva_refi", reasoning: "Mejor cobertura y tipo" },
    { product_id: "cat_embat_refi", reasoning: "Más caro" },
  ],
  headline: "Refinanciar con BBVA a €350k",
});

const action = {
  dimension_deltas: { debt: 0.12, liquidity: 0.04 },
  recommended_amount: 350_000,
};

describe("eval: never-calculate", () => {
  it("reassembly is deterministic (byte-equal match figures)", () => {
    const a = reassembleMatches(decision, snapshot, action);
    const b = reassembleMatches(decision, snapshot, action);
    expect(a.map((m) => m.breakdown.match)).toEqual(
      b.map((m) => m.breakdown.match)
    );
    expect(a.length).toBe(2);
    expect(a.every((m) => m.breakdown.match >= 0 && m.breakdown.match <= 1)).toBe(
      true
    );
  });

  it("drops invented product_ids — LLM cannot invent catalog rows", () => {
    const bad = {
      ...decision,
      terms: [
        ...decision.terms,
        {
          product_id: "PROD_invented_nowhere",
          amount: 350_000,
          interest_rate: 0.05,
          start_date: "2026-09-01",
          end_date: "2030-09-01",
        },
      ],
      ranking: [
        ...decision.ranking,
        { product_id: "PROD_invented_nowhere", reasoning: "fake" },
      ],
    };
    const matches = reassembleMatches(bad, snapshot, action);
    expect(matches.every((m) => m.product.product_id.startsWith("cat_"))).toBe(
      true
    );
    expect(
      matches.some((m) => m.product.product_id === "PROD_invented_nowhere")
    ).toBe(false);
  });
});
