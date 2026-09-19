import { describe, expect, it } from "vitest";
import {
  extractCitedScore,
  extractFigures,
  hasAnalystSections,
  parseSpanishNumber,
} from "./extract";
import { groundingRate, legalFigures } from "./grounding";

describe("extract", () => {
  it("parses Spanish thousand+decimal form", () => {
    expect(parseSpanishNumber("131.411,22")).toBeCloseTo(131411.22, 2);
    expect(parseSpanishNumber("12,5")).toBeCloseTo(12.5, 5);
    expect(parseSpanishNumber("62.4")).toBeCloseTo(62.4, 5);
    expect(parseSpanishNumber("450.000")).toBe(450000);
  });

  it("extracts figures from advisor prose", () => {
    const text =
      "El score es 62,4. `fee_outflow` = 131.411,22 EUR. DSCR 1,4 y overdue 21 %.";
    const figs = extractFigures(text);
    const values = figs.map((f) => f.value);
    expect(values).toContain(62.4);
    expect(values.some((v) => Math.abs(v - 131411.22) < 0.01)).toBe(true);
    expect(values).toContain(1.4);
    expect(values).toContain(21);
  });

  it("detects required analyst sections", () => {
    const ok = `
## Por qué este score
...
## Cómo mejorarlo
1. ...
## Otras métricas a revisar
...
## Qué no puedo concluir
...
`;
    expect(hasAnalystSections(ok).ok).toBe(true);
    expect(hasAnalystSections("solo prosa").missing.length).toBe(4);
  });

  it("extractCitedScore prefers score neighbourhood", () => {
    expect(extractCitedScore("El score es 59.9 y luego 1000.")).toBeCloseTo(
      59.9,
      5
    );
  });
});

describe("grounding", () => {
  it("grounds figures present in the fact pack for COMP_0001", () => {
    const legal = legalFigures("COMP_0001");
    expect(legal.length).toBeGreaterThan(10);
    const score = legal.find((n) => Math.abs(n - 59.9) < 0.05);
    expect(score).toBeDefined();

    const figs = extractFigures(
      "Score 59.9. Sin inventar: el buffer es irrelevante 987654321."
    );
    const report = groundingRate(figs, legal);
    expect(report.ungrounded.some((f) => f.value === 987654321)).toBe(true);
    expect(report.rate).toBeLessThan(1);
  });
});
