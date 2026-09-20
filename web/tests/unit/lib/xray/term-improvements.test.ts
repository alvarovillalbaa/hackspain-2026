import { describe, expect, it } from "vitest";
import { termImprovements } from "@/lib/xray/term-improvements";
import type {
  ProductMatch,
  ScoreSnapshot,
  TermContext,
} from "@/lib/xray/types";

function snapshot(over: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  return {
    company_id: "COMP_0001",
    month: "2026-08",
    score: 52,
    band: "BB",
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "high",
    sub_scores: {
    liquidity: 50,
    collections: 50,
    payments: 50,
    debt: 50,
    activity: 50,
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
      liquidity: 0.35,
      collections: 0.4,
      payments: 0.4,
      debt: 0.45,
      activity: 0.55,
    },
    peer_percentile: 40,
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    history: [],
    drivers: [],
    alerts: [],
    explanation: null,
    ...over,
  };
}

function context(over: Partial<TermContext> = {}): TermContext {
  return {
    company_id: "COMP_0001",
    cash_balance: 20_000,
    monthly_inflow_avg_3m: 80_000,
    monthly_outflow_avg_3m: 70_000,
    invoice_aging: {
      issued_pending: 10_000,
      received_pending: 5_000,
      issued_overdue: 0,
      received_overdue: 0,
      overdue_flow_rate_3m: 0.1,
    },
    implied_debt_rate: 0.06,
    cash_buffer_days: 10,
    dscr_6m: 1.5,
    overdue_flow_rate_3m: 0.1,
    ...over,
  };
}

function match(over: Partial<ProductMatch> = {}): ProductMatch {
  const base: ProductMatch = {
    product: {
      product_id: "PROD_1",
      issuer: {
        id: "iss_1",
        name: "Banco Demo",
        risk_appetite: ["AAA", "AA", "A", "BBB"],
        ticket_min: 50_000,
        ticket_max: 500_000,
        ticket_sweet_spot: 150_000,
        margin_target_bps: 200,
      },
      kind: "refinance",
      label: "Préstamo refinanciación",
      description: "Demo",
      issuer_terms: {
        rate_annual: 0.065,
        term_months: 36,
        fees_bps: 80,
        amortization: "constant_quote",
        collateral: "personal",
      },
      client_ideal_terms: {
        rate_annual: 0.045,
        term_months: 60,
        fees_bps: 40,
        amortization: "constant_quote",
        collateral: "none",
      },
      amount_min: 50_000,
      amount_max: 400_000,
    },
    amount: 120_000,
    breakdown: {
      client_fit: 0.6,
      issuer_appetite: 0.5,
      match: 0.55,
      factors: [
        { label: "Holgura DSCR", side: "client", score: 0.7 },
      ],
    },
    uplift: 4,
    projected_score: 56,
    projected_band: "BB",
    origin: "deterministic",
  };
  return { ...base, ...over, product: { ...base.product, ...over.product } };
}

describe("termImprovements", () => {
  it("returns nothing without context", () => {
    expect(
      termImprovements({ snapshot: snapshot(), context: null, match: match() })
    ).toEqual([]);
  });

  it("fires cobros from issued overdue toward lower rate", () => {
    const tips = termImprovements({
      snapshot: snapshot(),
      context: context({
        invoice_aging: {
          issued_pending: 0,
          received_pending: 0,
          issued_overdue: 80_000,
          received_overdue: 0,
          overdue_flow_rate_3m: 0.2,
        },
      }),
      match: match(),
    });
    const cobros = tips.find((t) => t.id === "cobros");
    expect(cobros).toBeDefined();
    expect(cobros!.moves).toContain("rate_annual");
    expect(cobros!.rationale).toMatch(/issued_overdue/);
    expect(cobros!.origin).toBe("deterministic");
  });

  it("fires pagos from received overdue toward softer collateral", () => {
    const tips = termImprovements({
      snapshot: snapshot(),
      context: context({
        invoice_aging: {
          issued_pending: 0,
          received_pending: 0,
          issued_overdue: 0,
          received_overdue: 40_000,
          overdue_flow_rate_3m: 0.15,
        },
      }),
      match: match(),
    });
    const pagos = tips.find((t) => t.id === "pagos");
    expect(pagos).toBeDefined();
    expect(pagos!.moves).toContain("collateral");
    expect(pagos!.rationale).toMatch(/received_overdue/);
  });

  it("fires caja when cash_buffer_days < 15", () => {
    const tips = termImprovements({
      snapshot: snapshot({ dimensions: {
        liquidity: 0.5,
        collections: 0.6,
        payments: 0.6,
        debt: 0.5,
        activity: 0.5,
      }}),
      context: context({ cash_buffer_days: 5 }),
      match: match(),
    });
    expect(tips.some((t) => t.id === "caja")).toBe(true);
  });

  it("fires dscr when dscr_6m < 1.2", () => {
    const tips = termImprovements({
      snapshot: snapshot(),
      context: context({ dscr_6m: 0.9, cash_buffer_days: 30 }),
      match: match(),
    });
    const dscr = tips.find((t) => t.id === "dscr");
    expect(dscr).toBeDefined();
    expect(dscr!.moves).toEqual(expect.arrayContaining(["ticket"]));
  });

  it("fires banda when band is outside issuer appetite", () => {
    const tips = termImprovements({
      snapshot: snapshot({ band: "BB" }),
      context: context({ cash_buffer_days: 30, dscr_6m: 2 }),
      match: match(),
    });
    expect(tips.some((t) => t.id === "banda")).toBe(true);
  });

  it("skips cobros when rate gap is already closed", () => {
    const m = match();
    m.product.issuer_terms.rate_annual = m.product.client_ideal_terms.rate_annual;
    const tips = termImprovements({
      snapshot: snapshot({ dimensions: {
        liquidity: 0.6,
        collections: 0.3,
        payments: 0.6,
        debt: 0.5,
        activity: 0.5,
      }}),
      context: context({
        cash_buffer_days: 30,
        dscr_6m: 2,
        invoice_aging: {
          issued_pending: 0,
          received_pending: 0,
          issued_overdue: 50_000,
          received_overdue: 0,
          overdue_flow_rate_3m: 0.2,
        },
      }),
      match: m,
    });
    expect(tips.find((t) => t.id === "cobros")).toBeUndefined();
  });

  it("caps at 4 tips", () => {
    const tips = termImprovements({
      snapshot: snapshot({
        band: "C",
        dimensions: {
          liquidity: 0.2,
          collections: 0.2,
          payments: 0.2,
          debt: 0.2,
          activity: 0.2,
        },
      }),
      context: context({
        cash_buffer_days: 3,
        dscr_6m: 0.8,
        invoice_aging: {
          issued_pending: 0,
          received_pending: 0,
          issued_overdue: 90_000,
          received_overdue: 50_000,
          overdue_flow_rate_3m: 0.4,
        },
      }),
      match: match(),
    });
    expect(tips.length).toBeLessThanOrEqual(4);
  });
});
