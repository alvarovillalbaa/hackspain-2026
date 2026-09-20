import { describe, expect, it } from "vitest";
import factsJson from "@/lib/xray/dataset/facts.json";
import scoresJson from "@/lib/xray/dataset/scores.json";
import { deterministicMarketplace } from "@/lib/xray/deterministic-marketplace";
import { recommendActions } from "@/lib/xray/recommend-actions";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import { DEFAULT_GROUP_COMPANIES } from "@/lib/xray/demo";
import { ScoreSnapshotSchema } from "@/lib/xray/schemas";
import importPacksJson from "@/lib/xray/dataset/import_packs.json";
import metricsJson from "@/lib/xray/dataset/metrics.json";
import { parseMethodMetrics } from "@/lib/xray/method-metrics";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";

const factsById = new Map(
  (factsJson as CompanyFacts[]).map((f) => [f.company_id, f] as const)
);
const scoresById = new Map(
  (scoresJson as ExportedScore[]).map((s) => [s.company_id, s] as const)
);

describe("live fact pack (Health Scorer + facts, no mocks)", () => {
  it("validates the published MPC seam for the portfolio and pre-scored imports", () => {
    const imports = importPacksJson.packs.flatMap((p) => p.scores as ExportedScore[]);
    for (const rows of [[...scoresById.values()], imports]) {
      expect(rows.some((r) => r.treasury != null)).toBe(true);
      for (const row of rows) {
        expect(row).toHaveProperty("treasury");
        const snapshot = ScoreSnapshotSchema.parse(snapshotFromExported(row));
        expect(snapshot.treasury).toEqual(row.treasury);
        if (!snapshot.treasury) continue;
        const { baseline, recommended, risk_weight, dscr_weight } = snapshot.treasury;
        expect(recommended.objective).toBeLessThanOrEqual(baseline.objective);
        expect(recommended.objective).toBeCloseTo(
          recommended.expected_cost + risk_weight * recommended.breach_prob
            + dscr_weight * recommended.dscr_fail_prob,
          6,
        );
      }
    }
  });

  it("has the demo group scored from data/raw", () => {
    for (const id of DEFAULT_GROUP_COMPANIES) {
      expect(scoresById.get(id), `missing Health Score for ${id}`).toBeTruthy();
      expect(factsById.get(id), `missing facts for ${id}`).toBeTruthy();
    }
  });

  it("grounds ficha actions from score + cash/debt/invoices", () => {
    const id = DEFAULT_GROUP_COMPANIES[0];
    const row = scoresById.get(id)!;
    const facts = factsById.get(id)!;
    const snapshot = snapshotFromExported(row);
    expect(snapshot.origin).toBe("ml");
    expect(snapshot.score).toBeGreaterThanOrEqual(0);
    expect(snapshot.score).toBeLessThanOrEqual(100);

    const actions = recommendActions({
      snapshot,
      facts,
      exported: row,
      currency: "EUR",
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.origin === "deterministic")).toBe(true);
    expect(actions.every((a) => a.recommended_amount > 0)).toBe(true);
  });

  it("builds a catalog marketplace from those grounded actions", () => {
    const id = DEFAULT_GROUP_COMPANIES[0];
    const row = scoresById.get(id)!;
    const facts = factsById.get(id)!;
    const snapshot = snapshotFromExported(row);
    const [action] = recommendActions({
      snapshot,
      facts,
      exported: row,
      currency: "EUR",
    });
    expect(action).toBeTruthy();
    const matches = deterministicMarketplace(snapshot, action!, undefined, facts);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.product.product_id.startsWith("cat_"))).toBe(
      true
    );
    expect(
      matches[0]!.breakdown.match >= matches[matches.length - 1]!.breakdown.match
    ).toBe(true);
  });

  it("publishes method metrics and real watch events", () => {
    const metrics = parseMethodMetrics(metricsJson);
    expect(metrics).not.toBeNull();
    expect(metrics!.lead_time.n_events).toBeGreaterThan(0);
    expect(metrics!.projection?.n ?? 0).toBeGreaterThan(0);
    const rows = [...scoresById.values()];
    expect(rows.some((r) => r.watch != null)).toBe(true);
    for (const row of rows) {
      expect(row.projection_6m.p10).toBeLessThanOrEqual(row.projection_6m.p50);
      expect(row.projection_6m.p50).toBeLessThanOrEqual(row.projection_6m.p90);
    }
  });
});
