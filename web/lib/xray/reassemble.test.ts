import { describe, expect, it } from "vitest";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { reassembleMatches } from "@/lib/xray/reassemble";
import type { ScoreSnapshot } from "@/lib/xray/types";
import { scoreFromDimensions } from "@/lib/xray/scoring";
import { scoreToBand } from "@/lib/xray/bands";

const dims = {
  liquidity: 0.42,
  collections: 0.71,
  payments: 0.38,
  debt: 0.35,
  activity: 0.62,
};

const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score: scoreFromDimensions(dims),
  band: scoreToBand(scoreFromDimensions(dims)),
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
    cash_buffer_days: 10,
    overdue_flow_rate_3m: 0.02,
    dscr_6m: 1.5,
    net_cash_flow_ratio_3m: 0.1,
  },
  dimensions: dims,
  peer_percentile: 41,
  projection_6m: { p10: 40, p50: 48, p90: 56 },
  history: [{ month: "2026-08", score: 48 }],
  drivers: [],
  alerts: [],
  explanation: null,
  origin: "deterministic",
};

const fixtureDecision = {
  company_id: "COMP_0001",
  action_id: "COMP_0001-refinance-0",
  action_kind: "refinance" as const,
  quantity: {
    company_id: "COMP_0001",
    action_kind: "refinance" as const,
    ideal_amount: 350_000,
    reasoning:
      "Enough to refinance the expensive pool without idle cash; larger tickets break DSCR 1.2",
    risks: ["Tipo variable en un contrato"],
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
    {
      product_id: "cat_bbva_refi",
      reasoning: "Mejor cobertura y tipo",
    },
    {
      product_id: "cat_embat_refi",
      reasoning: "Más caro",
    },
  ],
  headline: "Refinanciar con BBVA a €350k",
};

describe("RecommendationDecisionSchema", () => {
  it("parses a valid fixture", () => {
    const parsed = RecommendationDecisionSchema.parse(fixtureDecision);
    expect(parsed.quantity.reasoning.length).toBeGreaterThan(8);
    expect(parsed.terms).toHaveLength(2);
  });

  it("rejects short reasoning", () => {
    expect(() =>
      RecommendationDecisionSchema.parse({
        ...fixtureDecision,
        quantity: {
          ...fixtureDecision.quantity,
          reasoning: "short",
        },
      })
    ).toThrow();
  });
});

describe("reassembleMatches", () => {
  it("recomputes match figures and sorts descending", () => {
    const action = {
      dimension_deltas: { debt: 0.12, liquidity: 0.04 },
      recommended_amount: 450_000,
    };
    const matches = reassembleMatches(fixtureDecision, snapshot, action);
    expect(matches.length).toBe(2);
    expect(matches[0]!.breakdown.match).toBeGreaterThanOrEqual(
      matches[1]!.breakdown.match
    );
    expect(matches.every((m) => m.origin === "eve")).toBe(true);
    expect(matches[0]!.amount).toBe(350_000);
    expect(typeof matches[0]!.breakdown.match).toBe("number");
    expect(matches[0]!.rationale).toBeTruthy();
    expect(matches[0]!.start_date).toBe("2026-09-01");
    expect(matches.some((m) => m.product.product_id.startsWith("cat_"))).toBe(
      true
    );
  });

  it("drops unknown product_ids", () => {
    const action = {
      dimension_deltas: { debt: 0.1 },
      recommended_amount: 350_000,
    };
    const bad = {
      ...fixtureDecision,
      terms: [
        ...fixtureDecision.terms,
        {
          product_id: "PROD_invented_nowhere",
          amount: 350_000,
          interest_rate: 0.05,
          start_date: "2026-09-01",
          end_date: "2030-09-01",
        },
      ],
    };
    const matches = reassembleMatches(bad, snapshot, action);
    expect(
      matches.every((m) => m.product.product_id !== "PROD_invented_nowhere")
    ).toBe(true);
    expect(matches.length).toBe(2);
  });

  it("clamps agent rates outside catalog ranges", () => {
    const action = {
      dimension_deltas: { debt: 0.1 },
      recommended_amount: 350_000,
    };
    const hot = {
      ...fixtureDecision,
      terms: [
        {
          ...fixtureDecision.terms[0]!,
          product_id: "cat_bbva_refi",
          interest_rate: 0.25,
        },
      ],
      ranking: [fixtureDecision.ranking[0]!],
    };
    const matches = reassembleMatches(hot, snapshot, action);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.product.issuer_terms.rate_annual).toBeLessThanOrEqual(
      0.085
    );
  });
});
