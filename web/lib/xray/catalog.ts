/**
 * Static product catalog: financial entities × financing SKUs with ranges.
 * quantity→offerings→match quotes terms inside these ranges; never invents SKUs.
 */
import type {
  ActionKind,
  Band,
  CatalogEntity,
  CatalogProduct,
  IssuerProfile,
  OfferingTerms,
  ProductOffer,
  ProductTerms,
} from "./types";
import catalogJson from "./dataset/product_catalog.json";

type CatalogFile = {
  entities: CatalogEntity[];
  products: CatalogProduct[];
};

const catalog = catalogJson as CatalogFile;

const entitiesById = new Map(
  catalog.entities.map((e) => [e.id, e] as const)
);
const productsById = new Map(
  catalog.products.map((p) => [p.product_id, p] as const)
);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function listEntities(): CatalogEntity[] {
  return catalog.entities.slice();
}

export function getEntity(id: string): CatalogEntity | undefined {
  return entitiesById.get(id);
}

/** IssuerProfile projection for match/reassemble (same ids as before). */
export function entityToIssuer(entity: CatalogEntity): IssuerProfile {
  return {
    id: entity.id,
    name: entity.name,
    risk_appetite: entity.risk_appetite,
    ticket_min: entity.ticket_min,
    ticket_max: entity.ticket_max,
    ticket_sweet_spot: entity.ticket_sweet_spot,
    margin_target_bps: entity.margin_target_bps,
  };
}

export function getProduct(productId: string): CatalogProduct | undefined {
  return productsById.get(productId);
}

export function listAllProducts(): CatalogProduct[] {
  return catalog.products.slice();
}

export function listProducts(filter: {
  kind?: ActionKind;
  band?: Band;
  amount?: number;
}): CatalogProduct[] {
  return catalog.products.filter((p) => {
    if (filter.kind && filter.kind !== "amortize" && p.kind !== filter.kind) {
      return false;
    }
    if (filter.kind === "amortize") return false;
    const entity = entitiesById.get(p.entity_id);
    if (!entity) return false;
    if (filter.band && !entity.risk_appetite.includes(filter.band)) {
      return false;
    }
    if (filter.amount != null) {
      if (filter.amount < p.amount_min || filter.amount > p.amount_max) {
        return false;
      }
    }
    return true;
  });
}

/** Clamp point terms into the catalog product's allowable ranges. */
export function clampTerms(
  product: CatalogProduct,
  terms: ProductTerms
): ProductTerms {
  const amort = product.amortization_options.includes(terms.amortization)
    ? terms.amortization
    : product.amortization_options[0]!;
  const collateral = product.collateral_options.includes(terms.collateral)
    ? terms.collateral
    : product.collateral_options[0]!;
  return {
    rate_annual:
      Math.round(
        clamp(terms.rate_annual, product.rate_min, product.rate_max) * 10_000
      ) / 10_000,
    term_months: Math.round(
      clamp(terms.term_months, product.term_months_min, product.term_months_max)
    ),
    fees_bps: Math.round(
      clamp(terms.fees_bps, product.fees_bps_min, product.fees_bps_max)
    ),
    amortization: amort,
    collateral,
  };
}

export function clampAmountBounds(
  product: CatalogProduct,
  amountMin: number,
  amountMax: number
): { amount_min: number; amount_max: number } {
  const lo = clamp(amountMin, product.amount_min, product.amount_max);
  const hi = clamp(amountMax, product.amount_min, product.amount_max);
  return {
    amount_min: Math.min(lo, hi),
    amount_max: Math.max(lo, hi, Math.min(lo + 1, product.amount_max)),
  };
}

/** Join catalog SKU + quoted terms → UI ProductOffer. */
export function toProductOffer(
  product: CatalogProduct,
  terms: Pick<
    OfferingTerms,
    "amount_min" | "amount_max" | "issuer_terms" | "client_ideal_terms"
  >
): ProductOffer | null {
  const entity = entitiesById.get(product.entity_id);
  if (!entity) return null;
  const bounds = clampAmountBounds(product, terms.amount_min, terms.amount_max);
  return {
    product_id: product.product_id,
    issuer: entityToIssuer(entity),
    kind: product.kind,
    label: product.label,
    description: product.description,
    issuer_terms: clampTerms(product, terms.issuer_terms),
    client_ideal_terms: clampTerms(product, terms.client_ideal_terms),
    amount_min: bounds.amount_min,
    amount_max: bounds.amount_max,
  };
}

/**
 * Price a catalog product around a fair rate + entity margin, clipped to ranges.
 * Used by deterministicMarketplace and propose_terms.
 */
export function priceWithinCatalog(
  product: CatalogProduct,
  fairRate: number,
  opts?: { incumbent?: boolean; targetAmount?: number }
): {
  issuer_terms: ProductTerms;
  client_ideal_terms: ProductTerms;
  amount_min: number;
  amount_max: number;
} {
  const entity = entitiesById.get(product.entity_id)!;
  const spread = (opts?.incumbent ? 0.002 : 0.008) + entity.margin_target_bps / 20_000;
  const issuerRate = clamp(fairRate + spread, product.rate_min, product.rate_max);
  const clientRate = clamp(fairRate - 0.005, product.rate_min, product.rate_max);
  const termMid = Math.round(
    (product.term_months_min + product.term_months_max) / 2
  );
  const feesMid = Math.round((product.fees_bps_min + product.fees_bps_max) / 2);
  const issuer_terms: ProductTerms = {
    rate_annual: Math.round(issuerRate * 10_000) / 10_000,
    term_months: clamp(
      termMid - 6,
      product.term_months_min,
      product.term_months_max
    ),
    fees_bps: feesMid,
    amortization: product.amortization_options[0]!,
    collateral: product.collateral_options[0]!,
  };
  const client_ideal_terms: ProductTerms = {
    rate_annual: Math.round(clientRate * 10_000) / 10_000,
    term_months: clamp(
      termMid + 6,
      product.term_months_min,
      product.term_months_max
    ),
    fees_bps: Math.round((product.fees_bps_min + feesMid) / 2),
    amortization: product.amortization_options[0]!,
    collateral: product.collateral_options.includes("none")
      ? "none"
      : product.collateral_options[0]!,
  };

  let amount_min = product.amount_min;
  let amount_max = product.amount_max;
  if (opts?.targetAmount != null) {
    amount_min = clamp(
      Math.round(opts.targetAmount * 0.5),
      product.amount_min,
      product.amount_max
    );
    amount_max = clamp(
      Math.round(opts.targetAmount * 2),
      product.amount_min,
      product.amount_max
    );
    if (amount_max <= amount_min) {
      amount_max = Math.min(product.amount_max, amount_min + 50_000);
    }
  }
  return { issuer_terms, client_ideal_terms, amount_min, amount_max };
}

/** Fair rate by band — shared with offering get_rate_context. */
export function fairRateForBand(band: Band): number {
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
