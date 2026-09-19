import { describe, expect, it } from "vitest";
import {
  harmonicMean,
  issuerTerms,
  solveIdealAmount,
  defaultFitContext,
  DSCR_FLOOR,
} from "./match";
import type { ProductOffer, ScoreSnapshot } from "./types";

const snapshot: ScoreSnapshot = {
  company_id: "COMP_TEST",
  month: "2026-09",
  score: 55,
  band: "BB",
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: { bankability: 55, business_profile: 60 },
  dimensions: {
    liquidity: 0.45,
    collections: 0.55,
    payments: 0.5,
    debt: 0.4,
    activity: 0.6,
  },
  peer_percentile: 45,
  projection_6m: { p10: 48, p50: 54, p90: 62 },
  history: [],
  drivers: [],
  alerts: [],
  explanation: null,
};

const product: ProductOffer = {
  product_id: "P1",
  issuer: {
    id: "iss",
    name: "Test Bank",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 50_000,
    ticket_max: 500_000,
    ticket_sweet_spot: 200_000,
    margin_target_bps: 180,
  },
  kind: "refinance",
  label: "Test",
  description: "t",
  issuer_terms: {
    rate_annual: 0.06,
    term_months: 36,
    fees_bps: 120,
    amortization: "constant_quote",
    collateral: "personal",
  },
  client_ideal_terms: {
    rate_annual: 0.035,
    term_months: 60,
    fees_bps: 40,
    amortization: "constant_quote",
    collateral: "none",
  },
  amount_min: 50_000,
  amount_max: 500_000,
};

describe("match", () => {
  it("harmonic mean is zero if either side is zero", () => {
    expect(harmonicMean(0, 0.9)).toBe(0);
    expect(harmonicMean(0.8, 0)).toBe(0);
    expect(harmonicMean(0.5, 0.5)).toBeCloseTo(0.5);
  });

  it("solveIdealAmount stays within product bounds and respects DSCR floor constant", () => {
    expect(DSCR_FLOOR).toBe(1.2);
    const amt = solveIdealAmount(
      snapshot,
      {
        recommended_amount: 200_000,
        dimension_deltas: { debt: 0.1, liquidity: 0.05 },
      },
      product
    );
    expect(amt).toBeGreaterThanOrEqual(product.amount_min);
    expect(amt).toBeLessThanOrEqual(product.amount_max);
  });

  it("issuerTerms is never better for the client than ideal", () => {
    const ctx = defaultFitContext(snapshot);
    const terms = issuerTerms(product, 200_000, ctx);
    expect(terms.rate_annual).toBeGreaterThanOrEqual(
      product.client_ideal_terms.rate_annual
    );
    expect(terms.fees_bps).toBeGreaterThanOrEqual(
      product.client_ideal_terms.fees_bps
    );
  });
});
