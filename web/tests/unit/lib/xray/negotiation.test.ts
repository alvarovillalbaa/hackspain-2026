import { describe, expect, it } from "vitest";
import { leversFromMatch } from "@/lib/xray/negotiation";
import type { ProductMatch, ProductOffer, ProductTerms } from "@/lib/xray/types";

function terms(over: Partial<ProductTerms> = {}): ProductTerms {
  return {
    rate_annual: 0.06,
    fees_bps: 80,
    term_months: 36,
    amortization: "constant_quote",
    collateral: "personal",
    ...over,
  };
}

function match(issuer: ProductTerms, ideal: ProductTerms): ProductMatch {
  const product: ProductOffer = {
    product_id: "P1",
    issuer: {
      id: "iss",
      name: "Bank",
      risk_appetite: ["BB"],
      ticket_min: 10_000,
      ticket_max: 500_000,
      ticket_sweet_spot: 100_000,
      margin_target_bps: 200,
    },
    kind: "refinance",
    label: "Préstamo",
    description: "test",
    issuer_terms: issuer,
    client_ideal_terms: ideal,
    amount_min: 50_000,
    amount_max: 200_000,
  };
  return {
    product,
    amount: 100_000,
    breakdown: {
      client_fit: 0.7,
      issuer_appetite: 0.8,
      match: 0.75,
      factors: [],
    },
    uplift: 4,
    projected_score: 60,
    projected_band: "BB",
    origin: "deterministic",
  };
}

describe("leversFromMatch", () => {
  it("emits rate/fees/term/collateral when issuer is worse than ideal", () => {
    const levers = leversFromMatch(
      match(
        terms(),
        terms({
          rate_annual: 0.04,
          fees_bps: 40,
          term_months: 48,
          collateral: "none",
        })
      )
    );
    expect(levers.map((l) => l.id).sort()).toEqual([
      "collateral",
      "fees",
      "rate",
      "term",
    ]);
    expect(levers.every((l) => l.origin === "deterministic")).toBe(true);
  });

  it("is empty when terms already match the ideal", () => {
    const same = terms({
      rate_annual: 0.05,
      fees_bps: 50,
      collateral: "none",
    });
    expect(leversFromMatch(match(same, same))).toEqual([]);
  });
});
