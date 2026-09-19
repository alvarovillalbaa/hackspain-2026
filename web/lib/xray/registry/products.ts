import type { ActionKind, Band, ProductOffer } from "../types";
import {
  fairRateForBand,
  listProducts,
  priceWithinCatalog,
  toProductOffer,
} from "../catalog";
import { createRng, hashString } from "./seed";

/** Catalog products for an action kind (static registry — no RNG SKUs). */
export function productsForKind(kind: ActionKind, seedKey: string): ProductOffer[] {
  const rng = createRng(hashString(`products:${kind}:${seedKey}`));
  const fair = 0.04 + rng() * 0.02;
  const products = listProducts({ kind });
  // Deterministic shuffle via seed so mockProvider stays stable per company.
  const order = products
    .map((p, i) => ({ p, k: rng() + i * 1e-9 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p)
    .slice(0, Math.min(6, products.length));

  return order.flatMap((p) => {
    const priced = priceWithinCatalog(p, fairRateForBand("BB") ?? fair, {
      targetAmount: (p.amount_min + p.amount_max) / 2,
    });
    const offer = toProductOffer(p, priced);
    return offer ? [offer] : [];
  });
}

export function bandInAppetite(band: Band, appetite: Band[]): boolean {
  return appetite.includes(band);
}
