/**
 * Negotiation levers from the gap between issuer_terms and client_ideal_terms.
 * Deterministic — no LLM copy.
 */
import type { NegotiationLever, ProductMatch } from "./types";

export function leversFromMatch(match: ProductMatch): NegotiationLever[] {
  const { product } = match;
  const issuer = product.issuer_terms;
  const ideal = product.client_ideal_terms;
  const levers: NegotiationLever[] = [];

  if (issuer.rate_annual > ideal.rate_annual + 0.0005) {
    levers.push({
      id: "rate",
      label: "Bajar tipo",
      description: `Desde ${(issuer.rate_annual * 100).toFixed(2)} % hacia ${(ideal.rate_annual * 100).toFixed(2)} % (ideal cliente)`,
      field: "rate_annual",
      suggested: ideal.rate_annual,
      match_delta: 0.08,
      origin: "deterministic",
    });
  }

  if (issuer.fees_bps > ideal.fees_bps) {
    levers.push({
      id: "fees",
      label: "Reducir comisiones",
      description: `Desde ${issuer.fees_bps} bps hacia ${ideal.fees_bps} bps`,
      field: "fees_bps",
      suggested: ideal.fees_bps,
      match_delta: 0.04,
      origin: "deterministic",
    });
  }

  if (issuer.term_months < ideal.term_months) {
    levers.push({
      id: "term",
      label: "Alargar plazo",
      description: `Desde ${issuer.term_months}m hacia ${ideal.term_months}m`,
      field: "term_months",
      suggested: ideal.term_months,
      match_delta: 0.05,
      origin: "deterministic",
    });
  }

  if (issuer.collateral !== ideal.collateral) {
    levers.push({
      id: "collateral",
      label: "Suavizar colateral",
      description: `Desde ${issuer.collateral} hacia ${ideal.collateral}`,
      field: "collateral",
      suggested: ideal.collateral,
      match_delta: 0.03,
      origin: "deterministic",
    });
  }

  return levers;
}
