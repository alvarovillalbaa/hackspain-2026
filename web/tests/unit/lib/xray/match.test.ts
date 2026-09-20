import { describe, expect, it } from "vitest";
import {
  clientFit,
  harmonicMean,
  issuerTerms,
  solveIdealAmount,
  defaultFitContext,
  fitContext,
  fitContextFromFacts,
  DSCR_FLOOR,
} from "@/lib/xray/match";
import type { ProductOffer, ScoreSnapshot } from "@/lib/xray/types";
import type { CompanyFacts } from "@/lib/xray/dataset/types";

const snapshot: ScoreSnapshot = {
  company_id: "COMP_TEST",
  month: "2026-09",
  score: 55,
  band: "BB",
  outlook: "stable",
  trend: "flat",
  watch: null,
  confidence: "high",
  sub_scores: {
    liquidity: 55,
    collections: 60,
    payments: 55,
    debt: 55,
    activity: 60,
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

function facts(over: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    company_id: "COMP_TEST",
    cash_balance: 120_000,
    monthly_inflow_avg_3m: 300_000,
    monthly_outflow_avg_3m: 250_000,
    incumbent_banks: [],
    debt_by_type: {},
    contracts: [],
    cash_series: [],
    invoice_aging: {
      issued_pending: 600_000,
      received_pending: 0,
      issued_overdue: 0,
      received_overdue: 0,
      overdue_flow_rate_3m: 0,
    },
    top_counterparties: [],
    implied_debt_rate: 0.05,
    ...over,
  };
}

describe("fitContextFromFacts", () => {
  it("takes rate and inflow from the facts, not from the dimensions", () => {
    const ctx = fitContextFromFacts(facts());
    expect(ctx.currentImpliedRate).toBe(0.05);
    expect(ctx.monthlyInflow).toBe(300_000);
    // 600k receivables over 300k monthly inflow = 2 months of cycle
    expect(ctx.cashCycleMonths).toBeCloseTo(2);
  });

  it("falls back to the contract rate when implied_debt_rate is missing", () => {
    const ctx = fitContextFromFacts(
      facts({
        implied_debt_rate: null,
        contracts: [
          {
            product_id: "P",
            type: "loan",
            bank_name: "B",
            granted: 1_000_000,
            outstanding: 400_000,
            annual_rate: 0.042,
            amortization_type: "constant quote",
            total_periods: 26,
            interest_type: "fixed",
          },
        ],
      })
    );
    expect(ctx.currentImpliedRate).toBeCloseTo(0.042);
  });

  it("leaves the rate at zero with no debt, which keeps the rate factor neutral", () => {
    const ctx = fitContextFromFacts(facts({ implied_debt_rate: null }));
    expect(ctx.currentImpliedRate).toBe(0);

    const { factors } = clientFit(product, 200_000, product.issuer_terms, ctx);
    const rate = factors.find((f) => f.label.startsWith("Coste vs deuda"));
    expect(rate?.score).toBe(0.5);
    expect(rate?.label).toContain("sin deuda comparable");
  });

  it("uses outflow as the activity proxy when there is no inflow", () => {
    const ctx = fitContextFromFacts(
      facts({ monthly_inflow_avg_3m: 0, monthly_outflow_avg_3m: 90_000 })
    );
    expect(ctx.monthlyInflow).toBe(90_000);
  });

  it("clamps the cash cycle so the term factor stays meaningful", () => {
    const tiny = fitContextFromFacts(
      facts({ invoice_aging: { ...facts().invoice_aging, issued_pending: 1 } })
    );
    expect(tiny.cashCycleMonths).toBe(1);

    const huge = fitContextFromFacts(
      facts({
        invoice_aging: {
          ...facts().invoice_aging,
          issued_pending: 90_000_000,
        },
      })
    );
    expect(huge.cashCycleMonths).toBe(12);
  });

  it("degrades to the dimension heuristic only when facts are absent", () => {
    expect(fitContext(snapshot, null)).toEqual(defaultFitContext(snapshot));
    expect(fitContext(snapshot, facts())).toEqual(fitContextFromFacts(facts()));
  });
});
