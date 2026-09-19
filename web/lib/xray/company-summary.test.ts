import { describe, expect, it } from "vitest";
import { formatRatePct } from "./format";
import {
  buildCompanySummaries,
  companySituation,
} from "./company-summary";
import type {
  CompanyFacts,
  DatasetCompany,
  DebtContract,
  ExportedScore,
} from "./dataset/types";

function exported(
  id: string,
  over: Partial<ExportedScore> & Pick<ExportedScore, "score">
): ExportedScore {
  return {
    company_id: id,
    month: "2026-08",
    level: 0.5,
    state_index: 0.5,
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "high",
    n_signals: 4,
    n_red: 0,
    months_of_history: 12,
    signals: {
      cash_buffer_days: 30,
      overdue_flow_rate_3m: 0,
      dscr_6m: 2,
      net_cash_flow_ratio_3m: 0.1,
    },
    ranks: {
      cash_buffer_days: 50,
      overdue_flow_rate_3m: 50,
      dscr_6m: 50,
      net_cash_flow_ratio_3m: 50,
    },
    rank_balance: 0.5,
    rank_overdue: 0.5,
    rank_dscr: 0.5,
    rank_inflows: 0.5,
    dimensions: {
      liquidity: 0.5,
      collections: 0.5,
      payments: 0.5,
      debt: 0.5,
      activity: 0.5,
    },
    peer_percentile: 50,
    history: [{ month: "2026-08", score: over.score }],
    drivers: [],
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    origin: "ml",
    ...over,
  };
}

function company(id: string, name: string): DatasetCompany {
  return {
    company_id: id,
    group_id: "GROUP_1",
    name,
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 1,
  };
}

function contract(
  over: Partial<DebtContract> & Pick<DebtContract, "total_periods">
): DebtContract {
  return {
    product_id: "P1",
    type: "loan",
    bank_name: "Bank",
    granted: 100_000,
    outstanding: 80_000,
    annual_rate: 0.04,
    amortization_type: "french",
    interest_type: "fixed",
    ...over,
  };
}

function facts(
  id: string,
  over: Partial<CompanyFacts> = {}
): CompanyFacts {
  return {
    company_id: id,
    cash_balance: 0,
    monthly_inflow_avg_3m: 0,
    monthly_outflow_avg_3m: 0,
    incumbent_banks: [],
    debt_by_type: {},
    contracts: [],
    cash_series: [],
    invoice_aging: {
      issued_pending: 0,
      received_pending: 0,
      issued_overdue: 0,
      received_overdue: 0,
      overdue_flow_rate_3m: 0,
    },
    top_counterparties: [],
    implied_debt_rate: null,
    ...over,
  };
}

describe("companySituation", () => {
  it("uses the shortest remaining tenor within 12 months", () => {
    expect(
      companySituation(
        facts("A", {
          contracts: [
            contract({ total_periods: 84 }),
            contract({ total_periods: 4 }),
          ],
        })
      )
    ).toBe("Vence en 4 meses");
  });

  it("labels expensive debt when no short tenor", () => {
    expect(
      companySituation(
        facts("A", {
          implied_debt_rate: 0.05,
          contracts: [contract({ total_periods: 124 })],
        })
      )
    ).toBe("Deuda cara");
  });

  it("returns a dash when there is nothing to flag", () => {
    expect(companySituation(facts("A"))).toBe("—");
  });
});

describe("buildCompanySummaries", () => {
  it("joins score, cash and rate and skips companies without score", () => {
    const rows = buildCompanySummaries(
      [company("A", "Alfa"), company("B", "Beta"), company("Z", "Sin score")],
      [
        exported("A", { score: 20, outlook: "negative" }),
        exported("B", { score: 80, outlook: "positive" }),
      ],
      [
        facts("A", { cash_balance: 10_000, implied_debt_rate: 0.062 }),
        facts("B", { cash_balance: 90_000 }),
      ]
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      company_id: "B",
      name: "Beta",
      score: 80,
      cash_close: 90_000,
      implied_rate: null,
      situation: "—",
    });
    expect(rows[1]).toMatchObject({
      company_id: "A",
      implied_rate: 0.062,
      cash_close: 10_000,
    });
  });
});

describe("formatRatePct", () => {
  it("matches the Figma compact rates", () => {
    expect(formatRatePct(0.062)).toBe("6,2%");
    expect(formatRatePct(0.12)).toBe("12%");
    expect(formatRatePct(null)).toBe("—");
  });
});
