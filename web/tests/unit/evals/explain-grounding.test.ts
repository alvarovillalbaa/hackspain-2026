/**
 * Deterministic explain grounding: inventsNumbers + groundingRate.
 */
import { describe, expect, it } from "vitest";
import { inventsNumbers } from "@/lib/xray/explain";
import { extractFigures } from "@/evals/lib/extract";
import { groundingRate, legalFigures } from "@/evals/lib/grounding";
import { DEFAULT_GROUP_COMPANIES } from "@/lib/xray/demo";

describe("eval: explain-grounding", () => {
  it("inventsNumbers flags a figure absent from the source", () => {
    expect(inventsNumbers("score 55 band BB", "score 55 band BB")).toBe(false);
    expect(inventsNumbers("score 55 band BB", "score 91 band AA")).toBe(true);
  });

  it.each(DEFAULT_GROUP_COMPANIES)(
    "%s: citing exact legal figures is fully grounded",
    (id) => {
      const legal = legalFigures(id);
      expect(legal.length).toBeGreaterThan(5);
      // Pick finite values and cite them with the same string form extractFigures parses.
      const picks = legal.filter((n) => Number.isFinite(n)).slice(0, 5);
      const prose = picks.map((n) => String(n)).join(" y ");
      const figures = extractFigures(`Anclas: ${prose}.`);
      expect(figures.length).toBeGreaterThan(0);
      const report = groundingRate(figures, legal);
      expect(report.ungrounded).toEqual([]);
      expect(report.rate).toBe(1);
    }
  );
});
