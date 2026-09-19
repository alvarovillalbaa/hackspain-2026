import { describe, expect, it } from "vitest";
import {
  cv,
  cvWithin,
  isUnanimous,
  mean,
  modalAgreement,
  relErr,
  relativeHalfRange,
  stddev,
} from "./dispersion";

describe("dispersion", () => {
  it("cv is 0 for identical values", () => {
    expect(cv([10, 10, 10, 10])).toBe(0);
    expect(cvWithin([10, 10, 10], 0.02)).toBe(true);
  });

  it("cv detects >2% spread", () => {
    // mean=100, values 97 and 103 → sample sd ≈ 4.24 → cv ≈ 0.042
    const values = [97, 100, 103];
    expect(cv(values)).toBeGreaterThan(0.02);
    expect(cvWithin(values, 0.02)).toBe(false);
  });

  it("cv passes a tight cluster under 2%", () => {
    const values = [100, 100.5, 99.5, 100.2, 99.8];
    expect(cv(values)).toBeLessThan(0.02);
    expect(cvWithin(values, 0.02)).toBe(true);
  });

  it("near-zero mean uses absolute half-range instead of exploding", () => {
    expect(cv([0, 0, 0])).toBe(0);
    // span 0.001 around zero → half-range 0.0005
    expect(relativeHalfRange([0, 0.001])).toBeCloseTo(0.0005, 6);
    expect(cvWithin([0, 0.00001], 0.02)).toBe(true);
  });

  it("relErr is symmetric within floor", () => {
    expect(relErr(102, 100)).toBeCloseTo(0.02, 10);
    expect(relErr(100, 100)).toBe(0);
    expect(relErr(0, 0)).toBe(0);
  });

  it("modalAgreement reports unanimity", () => {
    expect(isUnanimous(["a", "a", "a"])).toBe(true);
    expect(isUnanimous(["a", "b", "a"])).toBe(false);
    expect(modalAgreement(["x", "y", "x"]).agreement).toBeCloseTo(2 / 3, 5);
    expect(modalAgreement([[1, 2], [1, 2], [1, 2]]).agreement).toBe(1);
  });

  it("mean and stddev match hand numbers", () => {
    expect(mean([2, 4, 6])).toBe(4);
    // sample sd of [2,4,6] = sqrt(8/2)=2
    expect(stddev([2, 4, 6])).toBeCloseTo(2, 10);
  });
});
