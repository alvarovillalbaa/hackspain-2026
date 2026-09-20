import { describe, expect, it } from "vitest";
import {
  driverIsGood,
  isRedRank,
  signalBlurb,
  signalLabel,
  signalPolarity,
} from "./signal-labels";

describe("signalLabel", () => {
  it("maps known Health Score signals to Spanish", () => {
    expect(signalLabel("cash_buffer_days")).toBe("Días de colchón de caja");
    expect(signalLabel("overdue_flow_rate_3m")).toBe(
      "Tasa de impago a 3 meses"
    );
    expect(signalLabel("dscr_6m")).toBe("DSCR a 6 meses");
    expect(signalLabel("net_cash_flow_ratio_3m")).toBe(
      "Flujo de caja neto a 3 meses"
    );
  });

  it("humanizes unknown snake_case keys", () => {
    expect(signalLabel("foo_bar_baz")).toBe("foo bar baz");
  });
});

describe("signalPolarity", () => {
  it("marks overdue as high-is-bad and the rest as low-is-bad", () => {
    expect(signalPolarity("overdue_flow_rate_3m")).toBe("high");
    expect(signalPolarity("cash_buffer_days")).toBe("low");
    expect(signalPolarity("dscr_6m")).toBe("low");
    expect(signalPolarity("net_cash_flow_ratio_3m")).toBe("low");
  });

  it("flags red ranks at the 0.20 cut", () => {
    expect(isRedRank(0.2)).toBe(true);
    expect(isRedRank(0.19)).toBe(true);
    expect(isRedRank(0.21)).toBe(false);
    expect(isRedRank(null)).toBe(false);
  });

  it("interprets driver deltas with polarity", () => {
    expect(driverIsGood("cash_buffer_days", 1.2)).toBe(true);
    expect(driverIsGood("cash_buffer_days", -1.2)).toBe(false);
    expect(driverIsGood("overdue_flow_rate_3m", -0.5)).toBe(true);
    expect(driverIsGood("overdue_flow_rate_3m", 0.5)).toBe(false);
  });

  it("returns a blurb for known signals", () => {
    expect(signalBlurb("dscr_6m")).toMatch(/servicio de deuda/i);
  });
});
