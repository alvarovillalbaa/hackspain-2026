import { describe, expect, it } from "vitest";
import {
  clampTerms,
  getProduct,
  listProducts,
  priceWithinCatalog,
  toProductOffer,
} from "./catalog";
import type { ProductTerms } from "./types";

describe("catalog", () => {
  it("lists products by kind and amount", () => {
    const loans = listProducts({ kind: "new_debt" });
    expect(loans.length).toBeGreaterThan(0);
    expect(loans.every((p) => p.kind === "new_debt")).toBe(true);

    const big = listProducts({ kind: "new_debt", amount: 600_000 });
    expect(big.some((p) => p.product_id === "cat_march_prestamo_500k")).toBe(
      true
    );
    expect(big.every((p) => p.amount_min <= 600_000 && p.amount_max >= 600_000)).toBe(
      true
    );
  });

  it("filters by band appetite", () => {
    const aaa = listProducts({ kind: "new_debt", band: "AAA" });
    // Embat Capital Desk is BBB–CCC only — should not appear for AAA
    expect(aaa.every((p) => p.entity_id !== "iss_fintech")).toBe(true);
  });

  it("clampTerms pulls rates into [rate_min, rate_max]", () => {
    const product = getProduct("cat_march_prestamo_500k")!;
    expect(product.rate_min).toBe(0.04);
    expect(product.rate_max).toBe(0.12);

    const low: ProductTerms = {
      rate_annual: 0.03,
      term_months: 12,
      fees_bps: 10,
      amortization: "bullet",
      collateral: "receivables",
    };
    const clampedLow = clampTerms(product, low);
    expect(clampedLow.rate_annual).toBe(0.04);
    expect(clampedLow.term_months).toBeGreaterThanOrEqual(product.term_months_min);
    expect(clampedLow.fees_bps).toBeGreaterThanOrEqual(product.fees_bps_min);
    expect(product.amortization_options).toContain(clampedLow.amortization);
    expect(product.collateral_options).toContain(clampedLow.collateral);

    const high: ProductTerms = {
      rate_annual: 0.2,
      term_months: 240,
      fees_bps: 999,
      amortization: "constant_quote",
      collateral: "asset",
    };
    const clampedHigh = clampTerms(product, high);
    expect(clampedHigh.rate_annual).toBe(0.12);
    expect(clampedHigh.term_months).toBeLessThanOrEqual(product.term_months_max);
    expect(clampedHigh.fees_bps).toBeLessThanOrEqual(product.fees_bps_max);
  });

  it("toProductOffer joins entity + clamped terms", () => {
    const product = getProduct("cat_bbva_circulante")!;
    const priced = priceWithinCatalog(product, 0.04, { targetAmount: 200_000 });
    const offer = toProductOffer(product, priced)!;
    expect(offer.product_id).toBe("cat_bbva_circulante");
    expect(offer.issuer.id).toBe("iss_bbva");
    expect(offer.issuer_terms.rate_annual).toBeGreaterThanOrEqual(product.rate_min);
    expect(offer.issuer_terms.rate_annual).toBeLessThanOrEqual(product.rate_max);
  });
});
