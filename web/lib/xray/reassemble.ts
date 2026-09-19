/**
 * Rebuild ProductMatch[] from agent decisions.
 * Every numeric figure comes from lib/xray — never from the model.
 * product_id must exist in the static catalog; unknown ids are dropped.
 * Rates/terms/amounts are clamped into catalog ranges.
 */
import type {
  ActionRecommendation,
  ProductMatch,
  ScoreSnapshot,
} from "./types";
import {
  computeMatch,
  defaultFitContext,
  issuerTerms,
} from "./match";
import { applyAction, upliftPoints } from "./scoring";
import type { RecommendationDecision } from "../../agent/lib/schemas";
import { getProduct, toProductOffer } from "./catalog";

export function reassembleMatches(
  decision: RecommendationDecision,
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">,
  origin: ProductMatch["origin"] = "eve"
): ProductMatch[] {
  const amount = decision.quantity.ideal_amount;
  const ctx = defaultFitContext(snapshot);
  const rationaleById = new Map(
    decision.ranking.map((r) => [r.product_id, r] as const)
  );

  const matches: ProductMatch[] = [];
  for (const offer of decision.offers) {
    const catalogProduct = getProduct(offer.product_id);
    if (!catalogProduct) continue;

    const product = toProductOffer(catalogProduct, {
      amount_min: offer.amount_min,
      amount_max: offer.amount_max,
      issuer_terms: offer.issuer_terms,
      client_ideal_terms: offer.client_ideal_terms,
    });
    if (!product) continue;

    const clamped = Math.max(
      product.amount_min,
      Math.min(product.amount_max, amount)
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
    const ranked = rationaleById.get(offer.product_id);
    matches.push({
      product: offerProduct,
      amount: clamped,
      breakdown,
      uplift: upliftPoints(snapshot, after),
      projected_score: after.score,
      projected_band: after.band,
      origin,
      rationale: ranked?.rationale ?? offer.issuer_rationale,
      risks: ranked?.risks ?? decision.quantity.risks,
    });
  }

  return matches.sort((a, b) => b.breakdown.match - a.breakdown.match);
}
