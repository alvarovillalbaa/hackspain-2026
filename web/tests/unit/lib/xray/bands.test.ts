import { describe, expect, it } from "vitest";
import { scoreToBand, bandMeta, BANDS } from "@/lib/xray/bands";

describe("scoreToBand", () => {
  it("maps boundary scores to the correct band", () => {
    expect(scoreToBand(100)).toBe("AAA");
    expect(scoreToBand(92)).toBe("AAA");
    expect(scoreToBand(91.9)).toBe("AA");
    expect(scoreToBand(55)).toBe("BB");
    expect(scoreToBand(54.9)).toBe("B");
    expect(scoreToBand(0)).toBe("C");
  });

  it("clamps out-of-range scores", () => {
    expect(scoreToBand(-10)).toBe("C");
    expect(scoreToBand(150)).toBe("AAA");
  });

  it("bandMeta returns tone and pd for every band", () => {
    for (const b of BANDS) {
      const meta = bandMeta(b.band);
      expect(meta.pd).toBeGreaterThan(0);
      expect(meta.label).toBe(b.band);
    }
  });
});
