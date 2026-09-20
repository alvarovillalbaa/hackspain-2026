import { describe, expect, it } from "vitest";
import { groupWatchQueue } from "./watch-queue";

describe("groupWatchQueue", () => {
  it("groups two rules for the same company into one row", () => {
    const items = groupWatchQueue(
      [
        {
          company_id: "COMP_0001",
          severity: "critical",
          rule_id: "dscr_floor",
          message: "DSCR 6m = 1.00 por debajo del suelo 1,2.",
          evidence: { score: 20, dscr_6m: 1 },
        },
        {
          company_id: "COMP_0001",
          severity: "warning",
          rule_id: "outlook_negative_worsening",
          message: "Outlook negativo y tendencia empeorando.",
          evidence: { score: 20 },
        },
      ],
      { COMP_0001: "Northbrook" }
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("Northbrook");
    expect(items[0]!.severity).toBe("critical");
    expect(items[0]!.rules).toEqual([
      "dscr_floor",
      "outlook_negative_worsening",
    ]);
    expect(items[0]!.score).toBe(20);
  });

  it("keeps ranked company order and falls back to id", () => {
    const items = groupWatchQueue(
      [
        {
          company_id: "COMP_A",
          severity: "warning",
          rule_id: "watch_event",
          message: "Watch activo: large_maturity.",
          evidence: { score: 40 },
        },
        {
          company_id: "COMP_B",
          severity: "warning",
          rule_id: "outlook_negative_worsening",
          message: "Outlook negativo.",
          evidence: { score: 50 },
        },
      ],
      { COMP_B: "Velasco" }
    );
    expect(items.map((i) => i.company_id)).toEqual(["COMP_A", "COMP_B"]);
    expect(items[0]!.name).toBe("COMP_A");
    expect(items[1]!.name).toBe("Velasco");
  });
});
