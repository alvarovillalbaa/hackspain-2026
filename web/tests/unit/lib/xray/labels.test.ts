import { describe, expect, it } from "vitest";
import {
  localizeWatchMessage,
  productTypeLabel,
  severityLabel,
  watchRuleLabel,
} from "@/lib/xray/labels";

describe("severityLabel", () => {
  it("maps watch severities to Spanish", () => {
    expect(severityLabel("warning")).toBe("Aviso");
    expect(severityLabel("critical")).toBe("Crítica");
  });

  it("capitalizes an unknown severity", () => {
    expect(severityLabel("minor")).toBe("Minor");
  });
});

describe("productTypeLabel", () => {
  it("maps every catalog product type", () => {
    expect(productTypeLabel("loan")).toBe("Préstamo");
    expect(productTypeLabel("leasing")).toBe("Leasing");
    expect(productTypeLabel("mortgage")).toBe("Hipoteca");
    expect(productTypeLabel("guarantee")).toBe("Aval");
    expect(productTypeLabel("renting")).toBe("Renting");
  });

  it("capitalizes any other value (book defaults included)", () => {
    expect(productTypeLabel("deuda")).toBe("Deuda");
    expect(productTypeLabel("Contratado")).toBe("Contratado");
  });
});

describe("watchRuleLabel", () => {
  it("maps the watch rules the server ranks", () => {
    expect(watchRuleLabel("dscr_floor")).toBe("DSCR < 1,2");
    expect(watchRuleLabel("outlook_negative_worsening")).toBe(
      "Perspectiva negativa"
    );
    expect(watchRuleLabel("watch_event")).toBe("En seguimiento");
  });

  it("maps the discrete watch events", () => {
    expect(watchRuleLabel("main_customer_lost")).toBe(
      "Cliente principal perdido"
    );
    expect(watchRuleLabel("expensive_new_debt")).toBe("Deuda nueva cara");
    expect(watchRuleLabel("large_maturity")).toBe("Vencimiento grande");
  });

  it("turns unknown underscores into spaces", () => {
    expect(watchRuleLabel("some_new_rule")).toBe("some new rule");
  });
});

describe("localizeWatchMessage", () => {
  it("replaces snake_case rule ids inside agent copy", () => {
    expect(localizeWatchMessage("Watch activo: main_customer_lost.")).toBe(
      "Watch activo: Cliente principal perdido."
    );
    expect(localizeWatchMessage("Watch activo: large_maturity.")).toBe(
      "Watch activo: Vencimiento grande."
    );
  });

  it("leaves ids-less copy and uppercase ids untouched", () => {
    expect(localizeWatchMessage("DSCR 6m = 1,00 por debajo del suelo 1,2.")).toBe(
      "DSCR 6m = 1,00 por debajo del suelo 1,2."
    );
    expect(localizeWatchMessage("Empresa COMP_0001 en cola.")).toBe(
      "Empresa COMP_0001 en cola."
    );
  });
});
