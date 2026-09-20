import { describe, expect, it } from "vitest";
import {
  actionKindLabel,
  formatBps,
  formatCompactEuro,
  formatCurrency,
  formatDelta,
  formatMonth,
  formatNumber,
  formatPercent,
  formatRate,
  formatRatePct,
  formatSignedNumber,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";

describe("formatCurrency", () => {
  it("formats euros", () => {
    expect(formatCurrency(1234.5, "EUR", true)).toMatch(/1.?234/);
  });

  it("falls back when currency code is garbage", () => {
    expect(formatCurrency(10, "NOTAREAL", false)).toContain("NOTAREAL");
  });
});

describe("formatCompactEuro", () => {
  it("uses k and M suffixes", () => {
    expect(formatCompactEuro(100_000)).toBe("100k€");
    expect(formatCompactEuro(2_500_000)).toBe("3M€");
    expect(formatCompactEuro(50)).toBe("50€");
  });

  it("preserves sign", () => {
    expect(formatCompactEuro(-12_000)).toBe("-12k€");
  });
});

describe("formatSlashDateFromMonth", () => {
  it("uses last day of month", () => {
    expect(formatSlashDateFromMonth("2026-08")).toBe("31/08/2026");
    expect(formatSlashDateFromMonth("2026-02")).toBe("28/02/2026");
  });

  it("passes through bad input", () => {
    expect(formatSlashDateFromMonth("nope")).toBe("nope");
  });
});

describe("formatRatePct", () => {
  it("renders null as em dash", () => {
    expect(formatRatePct(null)).toBe("—");
  });

  it("multiplies fraction by 100", () => {
    expect(formatRatePct(0.062)).toMatch(/6[,.]2%/);
  });
});

describe("formatPercent / formatNumber / formatMonth", () => {
  it("formatPercent uses Intl percent", () => {
    expect(formatPercent(0.5)).toMatch(/%/);
  });

  it("formatNumber is locale-aware", () => {
    expect(formatNumber(1234.5)).toMatch(/1.?234/);
  });

  it("formatMonth short-labels", () => {
    expect(formatMonth("2024-10").toLowerCase()).toMatch(/oct/);
  });

  it("formatMonth passes through garbage", () => {
    expect(formatMonth("xx")).toBe("xx");
  });
});

describe("formatDelta / formatSignedNumber / formatBps / formatRate / actionKindLabel", () => {
  it("formatDelta signs positive deltas", () => {
    expect(formatDelta(1.2)).toBe("+1,2 pts");
    expect(formatDelta(-0.5)).toBe("-0,5 pts");
  });

  it("formatSignedNumber uses plus, minus and plain zero", () => {
    expect(formatSignedNumber(1.1)).toBe("+ 1,1");
    expect(formatSignedNumber(-1.7)).toBe("− 1,7");
    expect(formatSignedNumber(0)).toBe("0");
  });

  it("formatBps appends bps", () => {
    expect(formatBps(180)).toBe("180 bps");
  });

  it("formatRate delegates to formatPercent", () => {
    expect(formatRate(0.05)).toMatch(/5\s*%/);
  });

  it("actionKindLabel maps kinds to Spanish labels", () => {
    expect(actionKindLabel("refinance")).toBe("Refinanciación");
    expect(actionKindLabel("factoring")).toBe("Anticipo de facturas");
  });
});
