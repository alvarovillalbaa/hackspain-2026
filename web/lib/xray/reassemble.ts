/**
 * Rebuild ProductMatch[] from agent decisions.
 * Every numeric figure comes from lib/xray — never from the model.
 */
import type {
  ActionKind,
  ActionRecommendation,
  Band,
  IssuerProfile,
  ProductMatch,
  ProductOffer,
  ScoreSnapshot,
} from "./types";
import {
  computeMatch,
  defaultFitContext,
  issuerTerms,
} from "./match";
import { applyAction, upliftPoints } from "./scoring";
import type { RecommendationDecision, OfferDecision } from "../../agent/lib/schemas";
import { DEFAULT_ISSUERS } from "./issuers";

function resolveIssuer(offer: OfferDecision): IssuerProfile {
  const known = DEFAULT_ISSUERS[offer.issuer_id];
  if (known) return known;
  return {
    id: offer.issuer_id,
    name: offer.issuer_name,
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB", "B"] as Band[],
    ticket_min: offer.amount_min,
    ticket_max: offer.amount_max,
    ticket_sweet_spot: (offer.amount_min + offer.amount_max) / 2,
    margin_target_bps: 200,
  };
}

function offerToProduct(offer: OfferDecision): ProductOffer {
  return {
    product_id: offer.product_id,
    issuer: resolveIssuer(offer),
    kind: offer.kind as ActionKind,
    label: offer.label,
    description: offer.description,
    issuer_terms: offer.issuer_terms,
    client_ideal_terms: offer.client_ideal_terms,
    amount_min: offer.amount_min,
    amount_max: offer.amount_max,
  };
}

export function reassembleMatches(
  decision: RecommendationDecision,
  snapshot: ScoreSnapshot,
  action: Pick<ActionRecommendation, "dimension_deltas" | "recommended_amount">
): ProductMatch[] {
  const amount = decision.quantity.ideal_amount;
  const ctx = defaultFitContext(snapshot);
  const rationaleById = new Map(
    decision.ranking.map((r) => [r.product_id, r] as const)
  );

  const matches: ProductMatch[] = decision.offers.map((offer) => {
    const product = offerToProduct(offer);
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
    return {
      product: offerProduct,
      amount: clamped,
      breakdown,
      uplift: upliftPoints(snapshot, after),
      projected_score: after.score,
      projected_band: after.band,
      origin: "eve" as const,
      rationale: ranked?.rationale ?? offer.issuer_rationale,
      risks: ranked?.risks ?? decision.quantity.risks,
    };
  });

  return matches.sort((a, b) => b.breakdown.match - a.breakdown.match);
}
