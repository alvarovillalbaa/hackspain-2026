import { describe, expect, it } from "vitest";
import factsJson from "./dataset/facts.json";
import scoresJson from "./dataset/scores.json";
import { deterministicMarketplace } from "./deterministic-marketplace";
import { recommendActions } from "./recommend-actions";
import { snapshotFromExported } from "./snapshot";
import { DEFAULT_GROUP_COMPANIES } from "./demo";
import type { CompanyFacts, ExportedScore } from "./dataset/types";

const factsById = new Map(
  (factsJson as CompanyFacts[]).map((f) => [f.company_id, f] as const)
);
const scoresById = new Map(
  (scoresJson as ExportedScore[]).map((s) => [s.company_id, s] as const)
);

describe("live fact pack (Health Scorer + facts, no mocks)", () => {
  it("has the demo group scored from docs/data/raw", () => {
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
});
