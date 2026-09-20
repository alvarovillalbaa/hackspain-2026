import { describe, expect, it } from "vitest";
import { rollupGroup, type GroupMemberInput } from "@/lib/xray/group-score";
import type { ExportedScore } from "@/lib/xray/dataset/types";

function exported(
  id: string,
  over: Partial<ExportedScore> & Pick<ExportedScore, "score">
): ExportedScore {
  const dimensions = over.dimensions ?? {
    liquidity: 0.5,
    collections: 0.5,
    payments: 0.5,
    debt: 0.5,
    activity: 0.5,
  };
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
    dimensions,
    peer_percentile: 50,
    history: [{ month: "2026-08", score: over.score }],
    drivers: [],
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    origin: "ml",
    ...over,
  };
}

function member(
  id: string,
  score: number,
  inflow: number,
  extra: Partial<ExportedScore> = {}
): GroupMemberInput {
  return {
    company_id: id,
    name: id,
    inflow,
    score: exported(id, { score, ...extra }),
  };
}

describe("rollupGroup", () => {
  it("weights the score by inflow like group_rollup", () => {
    const g = rollupGroup("GROUP_1", [
      member("A", 20, 1),
      member("B", 80, 3),
    ]);
    expect(g?.snapshot.score).toBe(65);
    expect(g?.n_companies).toBe(2);
    expect(g?.weakest_company_id).toBe("A");
    expect(g?.score_min).toBe(20);
    expect(g?.snapshot.origin).toBe("deterministic");
    expect(g?.snapshot.company_id).toBe("GROUP_1");
  });

  it("clips zero inflow at 1 so empty firms still count", () => {
    const g = rollupGroup("GROUP_1", [
      member("A", 20, 0),
      member("B", 80, 0),
    ]);
    expect(g?.snapshot.score).toBe(50);
  });

  it("takes drivers from the weakest member", () => {
    const g = rollupGroup("GROUP_1", [
      member("A", 20, 1, {
        drivers: [{ signal: "cash_buffer_days", delta: -5, since: "2026-06" }],
      }),
      member("B", 80, 1, {
        drivers: [{ signal: "dscr_6m", delta: 2, since: "2026-07" }],
      }),
    ]);
    expect(g?.snapshot.drivers[0]?.signal).toBe("cash_buffer_days");
  });

  it("returns null for an empty group", () => {
    expect(rollupGroup("GROUP_X", [])).toBeNull();
  });
});
