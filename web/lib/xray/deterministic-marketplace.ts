/**
 * Deterministic marketplace when Eve is unavailable.
 * Picks eligible catalog SKUs and prices within allowable ranges — never mints ENG_* ids.
 */
import type {
  ActionRecommendation,
  ProductMatch,
  ProductOffer,
  ScoreSnapshot,
} from "./types";
import type { CompanyFacts } from "./dataset/types";
import {
  computeMatch,
  fitContext,
  issuerTerms,
  solveIdealAmount,
} from "./match";
import { applyAction, upliftPoints } from "./scoring";
import {
  fairRateForBand,
  listProducts,
  priceWithinCatalog,
  toProductOffer,
} from "./catalog";

function buildOffers(
  kind: ActionRecommendation["kind"],
  band: ScoreSnapshot["band"]
): ProductOffer[] {
  const fair = fairRateForBand(band);
  // Soft band filter: prefer appetite match, but keep BB/B from falling empty.
  let products = listProducts({ kind, band });
  if (products.length === 0 && (band === "BB" || band === "B")) {
    products = listProducts({ kind });
  }
  return products.slice(0, 6).flatMap((p) => {
    const priced = priceWithinCatalog(p, fair);
    const offer = toProductOffer(p, priced);
    return offer ? [offer] : [];
  });
}

export function deterministicMarketplace(
  snapshot: ScoreSnapshot,
  action: ActionRecommendation,
  amount?: number,
  facts?: CompanyFacts | null
): ProductMatch[] {
  const catalog = buildOffers(action.kind, snapshot.band);
  const ctx = fitContext(snapshot, facts);

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
