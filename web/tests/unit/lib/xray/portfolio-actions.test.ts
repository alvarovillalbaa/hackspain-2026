import { describe, expect, it } from "vitest";
import {
  buildPortfolioActions,
  mergePortfolioAction,
  portfolioActionHref,
} from "@/lib/xray/portfolio-actions";
import type { ActionRecommendation } from "@/lib/xray/types";

function action(
  over: Partial<ActionRecommendation> & Pick<ActionRecommendation, "id" | "kind">
): ActionRecommendation {
  return {
    title: "Acción genérica",
    rationale: "Porque sí",
    recommended_amount: 50_000,
    uplift: 2,
    dimension_deltas: { debt: 0.05 },
    origin: "deterministic",
    ...over,
  };
}

describe("mergePortfolioAction", () => {
  it("keeps grounded amounts and overlays stored title", () => {
    const grounded = action({
      id: "c1-refinance-0",
      kind: "refinance",
      title: "Refinanciar deuda cara",
      uplift: 4.2,
      recommended_amount: 120_000,
    });
    const stored = action({
      id: "other",
      kind: "refinance",
      title: "Bajar el tipo del BBVA",
      origin: "eve",
      recommended_amount: 1,
      uplift: 99,
    });
    const merged = mergePortfolioAction(grounded, stored);
    expect(merged.title).toBe("Bajar el tipo del BBVA");
    expect(merged.recommended_amount).toBe(120_000);
    expect(merged.uplift).toBe(4.2);
    expect(merged.id).toBe("c1-refinance-0");
    expect(merged.origin).toBe("eve");
  });
});

describe("buildPortfolioActions", () => {
  it("ranks by uplift and tags company", () => {
    const rows = buildPortfolioActions([
      {
        company_id: "COMP_A",
        company_name: "Alpha",
        grounded: [
          action({ id: "a-1", kind: "amortize", uplift: 1, title: "Amortizar" }),
        ],
      },
      {
        company_id: "COMP_B",
        company_name: "Beta",
        grounded: [
          action({
            id: "b-1",
            kind: "refinance",
            uplift: 5,
            title: "Refinanciar",
          }),
        ],
        stored: [
          action({
            id: "ignored",
            kind: "refinance",
            title: "Eve copy",
            origin: "eve",
          }),
        ],
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].company_id).toBe("COMP_B");
    expect(rows[0].title).toBe("Eve copy");
    expect(rows[1].company_name).toBe("Alpha");
    expect(portfolioActionHref(rows[0])).toBe("/c/COMP_B/a/b-1");
  });
});
