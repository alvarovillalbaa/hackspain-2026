import { describe, expect, it } from "vitest";
import {
  MAX_COMPARE,
  alignHistories,
  compareHref,
  parseCompareIds,
} from "./compare";

describe("parseCompareIds", () => {
  it("trims, dedupes and caps at MAX_COMPARE", () => {
    expect(parseCompareIds(null)).toEqual([]);
    expect(parseCompareIds("  COMP_A, COMP_B ,COMP_A, COMP_C, COMP_D ")).toEqual([
      "COMP_A",
      "COMP_B",
      "COMP_C",
    ]);
    expect(parseCompareIds("COMP_A,COMP_B").length).toBeLessThanOrEqual(
      MAX_COMPARE
    );
  });
});

describe("compareHref", () => {
  it("builds a query with at most three unique ids", () => {
    expect(compareHref(["COMP_A", "COMP_B"])).toBe(
      "/compare?ids=COMP_A,COMP_B"
    );
    expect(compareHref(["a", "b", "c", "d"])).toBe("/compare?ids=a,b,c");
  });
});

describe("alignHistories", () => {
  it("unions months and leaves gaps undefined", () => {
    const rows = alignHistories([
      {
        key: "a",
        history: [
          { month: "2024-02", score: 40 },
          { month: "2024-03", score: 42 },
        ],
      },
      {
        key: "b",
        history: [{ month: "2024-01", score: 10 }],
      },
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2024-01", "2024-02", "2024-03"]);
    expect(rows[0]).toEqual({ month: "2024-01", a: undefined, b: 10 });
    expect(rows[1]).toEqual({ month: "2024-02", a: 40, b: undefined });
  });
});
