import { describe, expect, it } from "vitest";
import { appendCashProjection, rebuildCashHistory } from "@/lib/xray/cash-history";

describe("rebuildCashHistory", () => {
  it("reconstructs backwards from the as-of balance", () => {
    const series = [
      { month: "2026-06", inflow: 100, outflow: 80, net: 20, tx_count: 2 },
      { month: "2026-07", inflow: 90, outflow: 100, net: -10, tx_count: 2 },
      { month: "2026-08", inflow: 110, outflow: 90, net: 20, tx_count: 2 },
    ];
    // End balance 500 in Aug → Jul = 500-20=480 → Jun = 480-(-10)=490
    const hist = rebuildCashHistory(500, series);
    expect(hist.map((h) => h.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(hist[2]!.cash).toBe(500);
    expect(hist[1]!.cash).toBe(480);
    expect(hist[0]!.cash).toBe(490);
  });

  it("appends a 6m fan anchored at last cash, not p50", () => {
    const hist = rebuildCashHistory(100, [
      { month: "2026-08", inflow: 10, outflow: 5, net: 5, tx_count: 1 },
    ]);
    const withFan = appendCashProjection(hist, {
      p10: 50,
      p50: 80,
      p90: 120,
    });
    expect(withFan).toHaveLength(2);
    expect(withFan[0]!.cash).toBe(100);
    expect(withFan[0]!.p50).toBe(100);
    expect(withFan[0]!.p10).toBe(100);
    expect(withFan[1]!.month).toBe("2027-02");
    expect(withFan[1]!.p10).toBe(50);
    expect(withFan[1]!.p50).toBe(80);
  });
});
