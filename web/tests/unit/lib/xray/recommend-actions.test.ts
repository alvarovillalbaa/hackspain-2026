import { describe, expect, it } from "vitest";
import { scoreFromDimensions, radarUplift } from "@/lib/xray/scoring";
import { applyAgentCopy, recommendActions } from "@/lib/xray/recommend-actions";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";
import type { ScoreSnapshot } from "@/lib/xray/types";

function snapshot(over: Partial<ScoreSnapshot> = {}): ScoreSnapshot {
  const dimensions = {
    liquidity: 0.4,
    collections: 0.5,
    payments: 0.4,
    debt: 0.35,
    activity: 0.55,
  };
  return {
    company_id: "COMP_0001",
    month: "2026-08",
    score: 80,
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
    dimensions,
    peer_percentile: 40,
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    history: [],
    drivers: [],
    alerts: [],
    explanation: null,
    ...over,
  };
}

const emptyFacts: CompanyFacts = {
  company_id: "COMP_0001",
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
};

describe("recommendActions", () => {
  it("returns nothing when there is no fact pack", () => {
    expect(
      recommendActions({ snapshot: snapshot(), facts: null, exported: null })
    ).toEqual([]);
  });

  it("does not propose factoring/confirming; overdue alone yields no WC actions", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      invoice_aging: { ...emptyFacts.invoice_aging, issued_overdue: 80_000 },
    };
    const actions = recommendActions({
      snapshot: snapshot(),
      facts,
      exported: null,
    });
    expect(actions.every((a) => a.kind !== "factoring")).toBe(true);
    expect(actions.every((a) => a.kind !== "confirming")).toBe(true);
  });

  it("always includes amortize when there is debt", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      cash_balance: 5_000,
      debt_by_type: { loan: { count: 1, outstanding: 80_000, granted: 80_000 } },
    };
    const actions = recommendActions({
      snapshot: snapshot(),
      facts,
      exported: null,
    });
    expect(actions.some((a) => a.kind === "amortize")).toBe(true);
    expect(
      actions.some((a) =>
        ["refinance", "new_debt", "extend_line"].includes(a.kind)
      )
    ).toBe(true);
  });

  it("lets the agent write description and reasoning without touching amounts", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      cash_balance: 200_000,
      implied_debt_rate: 0.08,
      debt_by_type: {
        loan: { count: 1, outstanding: 150_000, granted: 150_000 },
      },
    };
    const ground = recommendActions({
      snapshot: snapshot(),
      facts,
      exported: null,
    });
    const amortize = ground.find((a) => a.kind === "amortize")!;
    const [a] = applyAgentCopy(ground, [
      {
        action: "amortize",
        description: "Bajar deuda con caja",
        reasoning: "Hay caja ociosa frente a deuda cara.",
      },
      {
        action: "factoring",
        description: "Inventada",
        reasoning: "esta kind no estaba en ground",
      },
    ]);
    expect(a.title).toBe("Bajar deuda con caja");
    expect(a.rationale).toBe(amortize.rationale);
    expect(a.reasoning).toBe("Hay caja ociosa frente a deuda cara.");
    expect(a.origin).toBe("eve");
  });

  it("proposes amortizing idle cash at the implied rate", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      cash_balance: 200_000,
      implied_debt_rate: 0.08,
      debt_by_type: {
        loan: { count: 1, outstanding: 150_000, granted: 150_000 },
      },
    };
    const actions = recommendActions({
      snapshot: snapshot(),
      facts,
      exported: null,
    });
    const a = actions.find((x) => x.kind === "amortize")!;
    expect(a.recommended_amount).toBe(150_000);
    expect(a.rationale).toMatch(/caja frente a deuda/);
  });

  it("does not mix Health Scorer points with radar what-if (uplift stays ≥ 0)", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      cash_balance: 50_000,
      debt_by_type: {
        loan: { count: 1, outstanding: 50_000, granted: 50_000 },
      },
    };
    const snap = snapshot({ score: 90 });
    const [a] = recommendActions({ snapshot: snap, facts, exported: null });
    expect(a.uplift).toBeGreaterThan(0);
    expect(a.uplift).toBe(
      radarUplift(snap, {
        dimension_deltas: a.dimension_deltas,
        recommended_amount: a.recommended_amount,
      })
    );
    expect(scoreFromDimensions(snap.dimensions)).toBeLessThan(90);
  });

  it("extends a drawn-down line of credit", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      debt_by_type: {
        lineofcredit: { count: 1, outstanding: 90_000, granted: 100_000 },
      },
    };
    const actions = recommendActions({
      snapshot: snapshot(),
      facts,
      exported: null,
    });
    expect(actions.some((a) => a.kind === "extend_line")).toBe(true);
    expect(
      actions.find((a) => a.kind === "extend_line")!.rationale
    ).toMatch(/línea está al 90/);
  });

  it("sizes a cash-buffer refill from days of cash and monthly outflow", () => {
    const facts: CompanyFacts = {
      ...emptyFacts,
      monthly_outflow_avg_3m: 120_000,
    };
    const exported = {
      signals: {
        cash_buffer_days: 3,
        overdue_flow_rate_3m: null,
        dscr_6m: null,
        net_cash_flow_ratio_3m: -0.2,
      },
    } as ExportedScore;
    const actions = recommendActions({
      snapshot: snapshot(),
      facts,
      exported,
    });
    const a = actions.find((x) => x.kind === "new_debt")!;
    expect(a.title).toBe("Reconstruir colchón de caja");
    expect(a.recommended_amount).toBeGreaterThanOrEqual(120_000);
    expect(a.rationale).toMatch(/colchón de caja es de 3 días/);
  });
});
