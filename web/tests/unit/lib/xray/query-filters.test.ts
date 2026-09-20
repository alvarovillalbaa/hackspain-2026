import { describe, expect, it } from "vitest";
import {
  applyChartFilters,
  applyQueryFilters,
  operatorsForType,
  sortRows,
  type QueryFilterRule,
} from "@/lib/xray/query-filters";

const rows = [
  { name: "Alpha", score: 80, outlook: "positive", imported: true },
  { name: "Beta", score: 40, outlook: "negative", imported: false },
  { name: "Gamma", score: 60, outlook: "stable", imported: false },
];

describe("applyQueryFilters", () => {
  it("filters by contains", () => {
    const rules: QueryFilterRule[] = [
      { id: "1", field: "name", operator: "contains", value: "bet" },
    ];
    expect(applyQueryFilters(rows, rules).map((r) => r.name)).toEqual([
      "Beta",
    ]);
  });

  it("filters numbers with gte", () => {
    const rules: QueryFilterRule[] = [
      { id: "1", field: "score", operator: "gte", value: 60 },
    ];
    expect(applyQueryFilters(rows, rules)).toHaveLength(2);
  });

  it("filters enum in", () => {
    const rules: QueryFilterRule[] = [
      {
        id: "1",
        field: "outlook",
        operator: "in",
        value: ["positive", "stable"],
      },
    ];
    expect(applyQueryFilters(rows, rules)).toHaveLength(2);
  });
});

describe("applyChartFilters", () => {
  it("intersects multi-select fields and sorts", () => {
    const out = applyChartFilters(rows, {
      byField: { outlook: ["positive", "stable"] },
      sortBy: "score",
      sortOrder: "desc",
    });
    expect(out.map((r) => r.name)).toEqual(["Alpha", "Gamma"]);
  });
});

describe("sortRows", () => {
  it("sorts ascending by name", () => {
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });
});

describe("operatorsForType", () => {
  it("returns number ops", () => {
    expect(operatorsForType("number")).toContain("gte");
  });
});
