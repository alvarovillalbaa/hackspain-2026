/**
 * Deterministic marketplace when Eve is unavailable.
 * Uses the shared issuer catalog + match.ts — never RNG mock scores.
 */
import type {
  ActionKind,
  ActionRecommendation,
  Band,
  IssuerProfile,
  ProductMatch,
  ProductOffer,
  ProductTerms,
  ScoreSnapshot,
} from "./types";
import {
  computeMatch,
  defaultFitContext,
  issuerTerms,
  solveIdealAmount,
} from "./match";
import { applyAction, upliftPoints } from "./scoring";
import { DEFAULT_ISSUERS } from "./issuers";

const KIND_LABELS: Record<ActionKind, string> = {
  refinance: "Préstamo refinanciación",
  new_debt: "Préstamo circulante",
  amortize: "Cancelación anticipada",
  extend_line: "Ampliación de línea",
  factoring: "Factoring con recurso",
  confirming: "Confirming proveedores",
};

/** Fair rate by band (same table as offering get_rate_context). */
function fairRate(band: Band): number {
  const table: Record<Band, number> = {
    AAA: 0.028,
    AA: 0.032,
    A: 0.036,
    BBB: 0.042,
    BB: 0.055,
    B: 0.072,
    CCC: 0.095,
    CC: 0.11,
    C: 0.13,
  };
  return table[band] ?? 0.05;
}

function termsFor(
  issuer: IssuerProfile,
  kind: ActionKind,
  band: Band
): { issuer: ProductTerms; client: ProductTerms; min: number; max: number } {
  const fair = fairRate(band);
  const margin = issuer.margin_target_bps / 10_000;
  const issuerRate = Math.round((fair + margin) * 10_000) / 10_000;
  const clientRate = Math.round((fair * 0.92) * 10_000) / 10_000;
  const termMonths =
    kind === "factoring" || kind === "confirming"
      ? 12
      : kind === "extend_line"
        ? 24
        : 48;
  return {
    issuer: {
      rate_annual: issuerRate,
      term_months: termMonths,
      fees_bps: Math.round(issuer.margin_target_bps / 4),
      amortization: "constant_quote",
      collateral: kind === "refinance" ? "personal" : "none",
    },
    client: {
      rate_annual: clientRate,
      term_months: termMonths + 12,
      fees_bps: Math.round(issuer.margin_target_bps / 8),
      amortization: "constant_quote",
      collateral: "none",
    },
    min: issuer.ticket_min,
    max: issuer.ticket_max,
  };
}

function buildOffers(
  kind: ActionKind,
  band: Band,
  companyId: string
): ProductOffer[] {
  return Object.values(DEFAULT_ISSUERS)
    .filter((issuer) => issuer.risk_appetite.includes(band) || band === "BB" || band === "B")
    .slice(0, 5)
    .map((issuer) => {
      const t = termsFor(issuer, kind, band);
      return {
        product_id: `ENG_${kind}_${issuer.id}_${companyId}`,
        issuer,
        kind,
        label: `${KIND_LABELS[kind]} · ${issuer.name}`,
        description: `Oferta determinista ${issuer.name} (motor de match).`,
        issuer_terms: t.issuer,
        client_ideal_terms: t.client,
        amount_min: t.min,
        amount_max: t.max,
      };
    });
}

export function deterministicMarketplace(
  snapshot: ScoreSnapshot,
  action: ActionRecommendation,
  amount?: number
): ProductMatch[] {
  const catalog = buildOffers(action.kind, snapshot.band, snapshot.company_id);
  const ctx = defaultFitContext(snapshot);

  const matches: ProductMatch[] = catalog.map((product) => {
    const ideal =
      amount ??
      solveIdealAmount(snapshot, action, product, ctx);
    const clamped = Math.max(
      product.amount_min,
      Math.min(product.amount_max, ideal)
    );
    const optimizedIssuer = issuerTerms(product, clamped, ctx);
    const offerProduct = { ...product, issuer_terms: optimizedIssuer };
    const breakdown = computeMatch(
      offerProduct,
      clamped,
      snapshot.band,
      optimizedIssuer,
      ctx
    );
    const after = applyAction(snapshot, action, clamped);
    return {
      product: offerProduct,
      amount: clamped,
      breakdown,
      uplift: upliftPoints(snapshot, after),
      projected_score: after.score,
      projected_band: after.band,
      origin: "deterministic" as const,
      rationale: `Match ${Math.round(breakdown.match * 100)} % · motor determinista (Eve no disponible).`,
      risks: ["Fallback sin sesión Eve — cifras del motor de match."],
    };
  });

  return matches.sort((a, b) => b.breakdown.match - a.breakdown.match);
}
