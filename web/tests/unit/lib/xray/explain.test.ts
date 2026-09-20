import { describe, expect, it } from "vitest";
import {
  ExplainSchema,
  extractNumbers,
  inventsNumbers,
  explanationKey,
} from "@/lib/xray/explain";

describe("explain", () => {
  it("parses dual-register schema", () => {
    const parsed = ExplainSchema.parse({
      plain: "La empresa tiene poco colchón de caja.",
      technical: "cash_buffer_days = 3 (suelo 15).",
    });
    expect(parsed.plain.length).toBeGreaterThan(8);
  });

  it("detects invented numbers", () => {
    const source = "El DSCR a 6 meses está en 1.10 sobre 120000 EUR.";
    expect(inventsNumbers(source, "El DSCR está en 1.10.")).toBe(false);
    expect(inventsNumbers(source, "El DSCR está en 2.50.")).toBe(true);
  });

  it("extracts percent and decimal tokens", () => {
    expect(extractNumbers("tipo 4,5 % y 80.000")).toEqual(["4.5", "80.000"]);
  });

  it("hashes text+context stably", () => {
    expect(explanationKey("hola", { a: 1 })).toBe(
      explanationKey("hola", { a: 1 })
    );
    expect(explanationKey("hola")).not.toBe(explanationKey("adios"));
  });
});
