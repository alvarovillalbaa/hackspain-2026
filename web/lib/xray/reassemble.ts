/**
 * Rebuild ProductMatch[] from agent decisions.
 * Every numeric figure comes from lib/xray — never from the model.
 * product_id must exist in the static catalog; unknown ids are dropped.
 * Rates/terms/amounts are clamped into catalog ranges.
 */
import type {
  ActionRecommendation,
  ProductMatch,
  ProductTerms,
  ScoreSnapshot,
} from "./types";
import {
  computeMatch,
  fitContext,
  issuerTerms,
} from "./match";
import { applyAction, upliftPoints } from "./scoring";
import type { CompanyFacts } from "./dataset/types";
import type {
  RecommendationDecision,
  TermQuote,
} from "../../agent/lib/schemas";
import {
  clampTerms,
  getProduct,
  toProductOffer,
} from "./catalog";

function monthsBetween(start: string, end: string): number {
  const [ys, ms] = start.split("-").map(Number);
  const [ye, me] = end.split("-").map(Number);
  if (!ys || !ms || !ye || !me) return 36;
  return Math.max(1, (ye - ys) * 12 + (me - ms));
}

/** Mid-range fees/amort/collateral from the SKU so match.ts stays happy. */
function skuDefaults(product: NonNullable<ReturnType<typeof getProduct>>): Omit<
  ProductTerms,
  "rate_annual" | "term_months"
> {
  return {
    fees_bps: Math.round((product.fees_bps_min + product.fees_bps_max) / 2),
    amortization: product.amortization_options[0]!,
    collateral: product.collateral_options[0]!,
  };
}

export function termQuoteToOfferShape(quote: TermQuote) {
  const catalog = getProduct(quote.product_id);
  if (!catalog) return null;
  const term_months = monthsBetween(quote.start_date, quote.end_date);
  const defaults = skuDefaults(catalog);
  const issuer_terms = clampTerms(catalog, {
    rate_annual: quote.interest_rate,
    term_months,
    ...defaults,
  });
  // Client ideal = slightly cheaper / longer (negotiation floor).
  const client_ideal_terms = clampTerms(catalog, {
    rate_annual: Math.max(catalog.rate_min, quote.interest_rate - 0.005),
    term_months: Math.min(catalog.term_months_max, term_months + 6),
    fees_bps: catalog.fees_bps_min,
    amortization: defaults.amortization,
    collateral: catalog.collateral_options.includes("none")
      ? "none"
      : defaults.collateral,
  });
  const amount = Math.max(
    catalog.amount_min,
    Math.min(catalog.amount_max, quote.amount)
  );
  return {
    catalog,
    amount,
    product: toProductOffer(catalog, {
      amount_min: catalog.amount_min,
      amount_max: catalog.amount_max,
      issuer_terms,
      client_ideal_terms,
    }),
    start_date: quote.start_date,
    end_date: quote.end_date,
  };
}

export function reassembleMatches(
  decision: RecommendationDecision,
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  origin: ProductMatch["origin"] = "eve",
  facts?: CompanyFacts | null
): ProductMatch[] {
  const amount = decision.quantity.ideal_amount;
  const ctx = fitContext(snapshot, facts);
  const rationaleById = new Map(
    decision.ranking.map((r) => [r.product_id, r] as const)
  );

  const matches: ProductMatch[] = [];
  for (const quote of decision.terms) {
    const shaped = termQuoteToOfferShape(quote);
    if (!shaped?.product) continue;

    const clamped = Math.max(
      shaped.product.amount_min,
      Math.min(shaped.product.amount_max, amount)
    );
    const optimizedIssuer = issuerTerms(shaped.product, clamped, ctx);
    const offerProduct = { ...shaped.product, issuer_terms: optimizedIssuer };
    const breakdown = computeMatch(
      offerProduct,
      clamped,
      snapshot.band,
      optimizedIssuer,
      ctx
    );
    const after = applyAction(snapshot, action, clamped);
    const ranked = rationaleById.get(quote.product_id);
    matches.push({
      product: offerProduct,
      amount: clamped,
      breakdown,
      uplift: upliftPoints(snapshot, after),
      projected_score: after.score,
      projected_band: after.band,
      origin,
      rationale: ranked?.reasoning,
      risks: decision.quantity.risks,
      start_date: shaped.start_date,
      end_date: shaped.end_date,
    });
  }

  return matches.sort((a, b) => b.breakdown.match - a.breakdown.match);
}
