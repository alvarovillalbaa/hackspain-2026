import { describe, expect, it } from "vitest";
import { buildDashboardKpis } from "./dashboard-kpis";
import type { CompanySummary } from "./company-summary";
import type { WatchQueueItem } from "./types";

function summary(over: Partial<CompanySummary> & Pick<CompanySummary, "company_id" | "score">): CompanySummary {
  return {
    group_id: "G1",
    name: over.company_id,
    outlook: "stable",
    situation: "—",
    implied_rate: null,
    cash_close: 10_000,
    month: "2026-08",
    ...over,
  };
}

describe("buildDashboardKpis", () => {
  it("aggregates scores, cash and watch", () => {
    const watch: WatchQueueItem[] = [
      {
        company_id: "A",
        name: "A",
        score: 20,
        severity: "warning",
        rules: ["watch_event"],
        message: "Watch",
      },
    ];
    const kpis = buildDashboardKpis(
      [
        summary({ company_id: "A", score: 82, outlook: "positive", cash_close: 5_000 }),
        summary({ company_id: "B", score: 35, outlook: "negative", cash_close: 15_000 }),
      ],
      watch
    );
    expect(kpis.n_companies).toBe(2);
    expect(kpis.mean_score).toBeCloseTo(58.5);
    expect(kpis.cash_close_sum).toBe(20_000);
    expect(kpis.outlook.positive).toBe(1);
    expect(kpis.outlook.negative).toBe(1);
    expect(kpis.watch_count).toBe(1);
    expect(kpis.top_scores[0].company_id).toBe("A");
    expect(kpis.bottom_scores[0].company_id).toBe("B");
    expect(kpis.histogram.find((h) => h.bucket === "80–100")?.count).toBe(1);
  });
});
