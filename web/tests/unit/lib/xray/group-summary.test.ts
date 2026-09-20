import { describe, expect, it } from "vitest";
import { formatCompactEuro, formatSlashDateFromMonth } from "@/lib/xray/format";
import { buildGroupSummaries } from "@/lib/xray/group-summary";
import type { CompanyFacts, DatasetCompany, ExportedScore } from "@/lib/xray/dataset/types";

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

function company(
  id: string,
  group: string,
  name: string
): DatasetCompany {
  return {
    company_id: id,
    group_id: group,
    name,
    country: "ES",
    currency: "EUR",
    n_companies_in_group: 2,
  };
}

function facts(id: string, cash: number, inflow: number): CompanyFacts {
  return {
    company_id: id,
    cash_balance: cash,
    monthly_inflow_avg_3m: inflow,
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
  };
}

describe("buildGroupSummaries", () => {
  it("rolls up score by inflow and picks holding name + best company", () => {
    const rows = buildGroupSummaries(
      [
        company("A", "GROUP_1", "Filial Sur"),
        company("B", "GROUP_1", "Iberia Holding"),
        company("C", "GROUP_2", "Solo S.L."),
      ],
      [
        exported("A", { score: 20, outlook: "negative" }),
        exported("B", { score: 80, outlook: "positive" }),
        exported("C", { score: 50, outlook: "stable" }),
      ],
      [facts("A", 10_000, 1), facts("B", 90_000, 3), facts("C", 5_000, 1)]
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      group_id: "GROUP_1",
      name: "Iberia Holding",
      score: 65,
      n_companies: 2,
      best_company_id: "B",
      best_company_name: "Iberia Holding",
      cash_close: 100_000,
    });
    expect(rows[1]?.group_id).toBe("GROUP_2");
  });

  it("skips groups with no scores", () => {
    const rows = buildGroupSummaries(
      [company("Z", "GROUP_Z", "Sin score")],
      [],
      []
    );
    expect(rows).toEqual([]);
  });
});

describe("formatCompactEuro", () => {
  it("matches the Figma compact labels", () => {
    expect(formatCompactEuro(100_000)).toBe("100k€");
    expect(formatCompactEuro(10_000_000)).toBe("10M€");
    expect(formatCompactEuro(420)).toBe("420€");
  });
});

describe("formatSlashDateFromMonth", () => {
  it("uses the last day of the month", () => {
    expect(formatSlashDateFromMonth("2026-08")).toBe("31/08/2026");
  });
});
