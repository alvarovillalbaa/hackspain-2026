import { describe, expect, it } from "vitest";
import {
  compact,
  companyMetrics,
  dataQuality,
  num,
  opportunities,
  percentile,
  percentileRank,
  requireCompany,
  workingCapital,
} from "./data";

describe("analyst fact-pack data layer", () => {
  it("loads companies from the committed pack", () => {
    const rows = companyMetrics();
    expect(rows.length).toBeGreaterThan(100);
    expect(dataQuality().company_count).toBe(rows.length);
  });

  it("requireCompany returns the EUR metric row", () => {
    const sample = companyMetrics()[0]!;
    const rows = requireCompany(sample.company_id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.company_id).toBe(sample.company_id);
    expect(rows[0]!.metric_currency).toBeTruthy();
  });

  it("requireCompany throws on unknown id", () => {
    expect(() => requireCompany("COMP_9999")).toThrow(/Unknown company_id/);
  });

  it("workingCapital returns monthly series for a company with cash", () => {
    const withCash = companyMetrics().find((r) => Number(r.cash_balance) > 0);
    expect(withCash).toBeTruthy();
    const series = workingCapital().filter(
      (r) => r.company_id === withCash!.company_id
    );
    expect(series.length).toBeGreaterThan(0);
    expect(series[0]).toHaveProperty("month");
  });

  it("opportunities include refinancing screens when contracts exist", () => {
    const refs = opportunities().filter(
      (o) => o.opportunity_type === "refinancing_screen"
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0]!.product_evidence?.length).toBeGreaterThan(0);
  });

  it("compact drops zeros", () => {
    expect(compact({ a: "1", b: "0", c: "" })).toEqual({ a: "1" });
  });

  it("num / percentile helpers", () => {
    expect(num("")).toBeNull();
    expect(num("3.5")).toBe(3.5);
    const xs = [1, 2, 3, 4, 5];
    expect(percentile(xs, 50)).toBe(3);
    expect(percentileRank(xs, 4)).toBe(60);
  });
});
