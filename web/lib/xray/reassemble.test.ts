import { describe, expect, it } from "vitest";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { reassembleMatches } from "@/lib/xray/reassemble";
import type { ScoreSnapshot } from "@/lib/xray/types";
import { scoreFromDimensions } from "@/lib/xray/scoring";
import { scoreToBand } from "@/lib/xray/bands";

const snapshot: ScoreSnapshot = {
  company_id: "COMP_0001",
  month: "2026-08",
  score: scoreFromDimensions({
    liquidity: 0.42,
    collections: 0.71,
    payments: 0.38,
    debt: 0.35,
    activity: 0.62,
  }),
  band: scoreToBand(
    scoreFromDimensions({
      liquidity: 0.42,
      collections: 0.71,
      payments: 0.38,
      debt: 0.35,
      activity: 0.62,
    })
  ),
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: { bankability: 40, business_profile: 65 },
  dimensions: {
    liquidity: 0.42,
    collections: 0.71,
    payments: 0.38,
    debt: 0.35,
    activity: 0.62,
  },
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
    amount_min: 200_000,
    amount_max: 500_000,
    ceiling_reason: "DSCR would fall below 1.2 above €500k",
    rationale: "Enough to refinance the expensive pool without idle cash",
    risks: ["Tipo variable en un contrato"],
  },
  offers: [
    {
      product_id: "cat_bbva_refi",
      issuer_id: "iss_bbva",
      issuer_name: "BBVA Empresas",
      kind: "refinance" as const,
      label: "Refinanciación BBVA",
      description: "Pool fijo",
      amount_min: 100_000,
      amount_max: 800_000,
      issuer_terms: {
        rate_annual: 0.045,
        term_months: 48,
        fees_bps: 90,
        amortization: "constant_quote" as const,
        collateral: "none" as const,
      },
      client_ideal_terms: {
        rate_annual: 0.032,
        term_months: 60,
        fees_bps: 40,
        amortization: "constant_quote" as const,
        collateral: "none" as const,
      },
      issuer_rationale: "Incumbent relationship and BB band appetite",
    },
    {
      product_id: "cat_embat_refi",
      issuer_id: "iss_fintech",
      issuer_name: "Embat Capital Desk",
      kind: "refinance" as const,
      label: "Refi Embat Capital",
      description: "Desk fintech",
      amount_min: 50_000,
      amount_max: 600_000,
      issuer_terms: {
        rate_annual: 0.062,
        term_months: 36,
        fees_bps: 140,
        amortization: "constant_quote" as const,
        collateral: "personal" as const,
      },
      client_ideal_terms: {
        rate_annual: 0.05,
        term_months: 48,
        fees_bps: 80,
        amortization: "constant_quote" as const,
        collateral: "personal" as const,
      },
      issuer_rationale: "Higher margin for BB risk",
    },
  ],
  ranking: [
    {
      product_id: "cat_bbva_refi",
      match: 0.72,
      client_fit: 0.8,
      issuer_appetite: 0.65,
      rationale: "Mejor cobertura y tipo",
      risks: [],
    },
    {
      product_id: "cat_embat_refi",
      match: 0.41,
      client_fit: 0.5,
      issuer_appetite: 0.35,
      rationale: "Más caro",
      risks: ["Colateral personal"],
    },
  ],
  headline: "Refinanciar con BBVA a €350k — match 72%",
};

describe("RecommendationDecisionSchema", () => {
  it("parses a valid fixture", () => {
    const parsed = RecommendationDecisionSchema.parse(fixtureDecision);
    expect(parsed.quantity.ceiling_reason.length).toBeGreaterThan(8);
    expect(parsed.offers).toHaveLength(2);
  });

  it("rejects missing ceiling_reason", () => {
    expect(() =>
      RecommendationDecisionSchema.parse({
        ...fixtureDecision,
        quantity: {
          ...fixtureDecision.quantity,
          ceiling_reason: "short",
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
    // Figures are recomputed — not copied from ranking.match
    expect(typeof matches[0]!.breakdown.match).toBe("number");
    expect(matches[0]!.rationale).toBeTruthy();
    // Labels come from catalog, not agent prose
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
      offers: [
        ...fixtureDecision.offers,
        {
          product_id: "PROD_invented_nowhere",
          amount_min: 100_000,
          amount_max: 500_000,
          issuer_terms: fixtureDecision.offers[0]!.issuer_terms,
          client_ideal_terms: fixtureDecision.offers[0]!.client_ideal_terms,
          issuer_rationale: "Should be dropped — not in catalog",
        },
      ],
    };
    const matches = reassembleMatches(bad, snapshot, action);
    expect(matches.every((m) => m.product.product_id !== "PROD_invented_nowhere")).toBe(
      true
    );
    expect(matches.length).toBe(2);
  });

  it("clamps agent rates outside catalog ranges", () => {
    const action = {
      dimension_deltas: { debt: 0.1 },
      recommended_amount: 350_000,
    };
    const hot = {
      ...fixtureDecision,
      offers: [
        {
          ...fixtureDecision.offers[0]!,
          product_id: "cat_bbva_refi",
          issuer_terms: {
            ...fixtureDecision.offers[0]!.issuer_terms,
            rate_annual: 0.25, // above cat_bbva_refi rate_max 0.085
          },
        },
      ],
      ranking: [fixtureDecision.ranking[0]!],
    };
    const matches = reassembleMatches(hot, snapshot, action);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.product.issuer_terms.rate_annual).toBeLessThanOrEqual(0.085);
  });
});
