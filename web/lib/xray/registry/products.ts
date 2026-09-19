import type {
  ActionKind,
  Band,
  IssuerProfile,
  ProductOffer,
  ProductTerms,
} from "../types";
import { createRng, hashString, pick, range } from "./seed";

const ISSUERS: IssuerProfile[] = [
  {
    id: "iss_bbva",
    name: "BBVA Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 50_000,
    ticket_max: 2_000_000,
    ticket_sweet_spot: 400_000,
    margin_target_bps: 180,
  },
  {
    id: "iss_santander",
    name: "Santander Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB", "B"],
    ticket_min: 75_000,
    ticket_max: 3_000_000,
    ticket_sweet_spot: 500_000,
    margin_target_bps: 160,
  },
  {
    id: "iss_sabadell",
    name: "Sabadell Empresas",
    risk_appetite: ["AAA", "AA", "A", "BBB", "BB"],
    ticket_min: 40_000,
    ticket_max: 1_500_000,
    ticket_sweet_spot: 250_000,
    margin_target_bps: 200,
  },
  {
    id: "iss_march",
    name: "Banca March",
    risk_appetite: ["AAA", "AA", "A", "BBB"],
    ticket_min: 100_000,
    ticket_max: 5_000_000,
    ticket_sweet_spot: 800_000,
    margin_target_bps: 140,
  },
  {
    id: "iss_fintech",
    name: "Embat Capital Desk",
    risk_appetite: ["BBB", "BB", "B", "CCC"],
    ticket_min: 30_000,
    ticket_max: 800_000,
    ticket_sweet_spot: 150_000,
    margin_target_bps: 280,
  },
];

function terms(
  rate: number,
  months: number,
  fees: number,
  amort: ProductTerms["amortization"] = "constant_quote",
  collateral: ProductTerms["collateral"] = "none"
): ProductTerms {
  return {
    rate_annual: Math.round(rate * 10_000) / 10_000,
    term_months: months,
    fees_bps: fees,
    amortization: amort,
    collateral,
  };
}

const KIND_LABELS: Record<ActionKind, string> = {
  refinance: "Préstamo refinanciación",
  new_debt: "Préstamo circulante",
  amortize: "Cancelación anticipada",
  extend_line: "Ampliación de línea",
  factoring: "Factoring con recurso",
  confirming: "Confirming proveedores",
};

/** Build a catalog of products for an action kind. */
export function productsForKind(kind: ActionKind, seedKey: string): ProductOffer[] {
  const rng = createRng(hashString(`products:${kind}:${seedKey}`));
  const count = 4 + Math.floor(rng() * 3);
  const out: ProductOffer[] = [];

  for (let i = 0; i < count; i++) {
    const issuer = pick(rng, ISSUERS);
    const baseRate = 0.025 + rng() * 0.055;
    const clientRate = baseRate * (0.75 + rng() * 0.15);
    const issuerRate = baseRate * (1.05 + rng() * 0.25);
    const term = Math.round(range(rng, 12, 84));
    const feesIssuer = Math.round(range(rng, 40, 180));
    const feesClient = Math.round(feesIssuer * (0.4 + rng() * 0.3));

    const min = Math.round(issuer.ticket_min * (0.8 + rng() * 0.4));
    const max = Math.round(issuer.ticket_max * (0.5 + rng() * 0.5));

    out.push({
      product_id: `PROD_${kind}_${issuer.id}_${i}`,
      issuer,
      kind,
      label: `${KIND_LABELS[kind]} · ${issuer.name}`,
      description: `Oferta ${issuer.name} optimizada para ticket ${Math.round(issuer.ticket_sweet_spot / 1000)}k €.`,
      issuer_terms: terms(
        issuerRate,
        Math.max(12, term - Math.round(rng() * 12)),
        feesIssuer,
        rng() > 0.7 ? "interest_only" : "constant_quote",
        rng() > 0.6 ? "personal" : "none"
      ),
      client_ideal_terms: terms(
        clientRate,
        term + Math.round(rng() * 12),
        feesClient,
        "constant_quote",
        "none"
      ),
      amount_min: Math.min(min, max),
      amount_max: Math.max(min, max, min + 50_000),
    });
  }
  return out;
}

export function bandInAppetite(band: Band, appetite: Band[]): boolean {
  return appetite.includes(band);
}
