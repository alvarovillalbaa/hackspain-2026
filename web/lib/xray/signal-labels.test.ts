import { describe, expect, it } from "vitest";
import { signalLabel } from "./signal-labels";

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
