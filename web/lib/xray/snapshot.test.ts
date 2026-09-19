import { describe, expect, it } from "vitest";
import { snapshotFromExported, buildScoreExplanation } from "./snapshot";
import type { ExportedScore } from "./dataset/types";

function row(over: Partial<ExportedScore> = {}): ExportedScore {
  return {
    company_id: "COMP_0001",
    month: "2026-08",
    score: 56.9,
    level: 0.5,
    state_index: 0.5,
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "medium",
    n_signals: 4,
    n_red: 0,
    months_of_history: 7,
    signals: {
      cash_buffer_days: 10,
      overdue_flow_rate_3m: 0.02,
      dscr_6m: 1.5,
      net_cash_flow_ratio_3m: 0.1,
    },
    ranks: {
      cash_buffer_days: 0.4,
      overdue_flow_rate_3m: 0.5,
      dscr_6m: 0.6,
      net_cash_flow_ratio_3m: 0.5,
    },
    rank_balance: 0.4,
    rank_overdue: 0.5,
    rank_dscr: 0.6,
    rank_inflows: 0.5,
    dimensions: {
      liquidity: 0.4,
      collections: 0.5,
      payments: 0.5,
      debt: 0.6,
      activity: 0.5,
    },
    peer_percentile: 50,
    history: [{ month: "2026-08", score: 56.9 }],
    drivers: [
      { signal: "cash_buffer_days", delta: -1.2, since: "2026-07" },
    ],
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    origin: "ml",
    ...over,
  };
}

describe("snapshotFromExported", () => {
  it("fills a deterministic explanation", () => {
    const snap = snapshotFromExported(row());
    expect(snap.explanation).toBeTruthy();
    expect(snap.explanation).toMatch(/Health Score 56\.9/);
    expect(snap.explanation).toMatch(/cash_buffer_days/);
    expect(snap.explanation).toMatch(/DSCR 6m/);
  });

  it("mentions watch and low DSCR when present", () => {
    const text = buildScoreExplanation(
      row({
        watch: "Caída brusca de caja",
        signals: {
          cash_buffer_days: 2,
          overdue_flow_rate_3m: 0.1,
          dscr_6m: 0.9,
          net_cash_flow_ratio_3m: -0.2,
        },
      })
    );
    expect(text).toMatch(/Watch/);
    expect(text).toMatch(/por debajo del suelo/);
  });
});
