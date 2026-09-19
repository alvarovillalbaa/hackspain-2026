import type { AcceptedDeal } from "./types";
import type { DebtContract } from "./dataset/types";

export type BookProductSource = "contract" | "deal";

/** One row of the live debt / contracted book. */
export interface BookProduct {
  id: string;
  company_id: string;
  company_name: string;
  currency: string;
  entity_name: string;
  type_label: string;
  outstanding: number | null;
  annual_rate: number | null;
  residual_periods: number | null;
  source: BookProductSource;
  /** Deal-only fields. */
  product_id?: string;
  accepted_at?: string;
}

export interface BookContractInput {
  company_id: string;
  company_name: string;
  currency: string;
  contracts: DebtContract[];
}

/**
 * Live book = outstanding debt contracts + accepted marketplace deals.
 * Deals are tagged "Contratado"; contracts keep bank/type from facts.
 */
export function buildBookProducts(
  companies: BookContractInput[],
  deals: AcceptedDeal[]
): BookProduct[] {
  const nameById = new Map(
    companies.map((c) => [c.company_id, c] as const)
  );
  const rows: BookProduct[] = [];

  for (const c of companies) {
    for (const contract of c.contracts) {
      const outstanding = contract.outstanding;
      if (outstanding == null || outstanding <= 0) continue;
      rows.push({
        id: `contract:${c.company_id}:${contract.product_id}`,
        company_id: c.company_id,
        company_name: c.company_name,
        currency: c.currency,
        entity_name: contract.bank_name || "—",
        type_label: contract.type || "deuda",
        outstanding: Math.abs(outstanding),
        annual_rate: contract.annual_rate,
        residual_periods: contract.total_periods,
        source: "contract",
        product_id: contract.product_id,
      });
    }
  }

  for (const deal of deals) {
    const meta = nameById.get(deal.company_id);
    rows.push({
      id: `deal:${deal.company_id}:${deal.product_id}`,
      company_id: deal.company_id,
      company_name: meta?.company_name ?? deal.company_id,
      currency: meta?.currency ?? "EUR",
      entity_name: deal.issuer_name,
      type_label: "Contratado",
      outstanding: deal.amount,
      annual_rate: null,
      residual_periods: null,
      source: "deal",
      product_id: deal.product_id,
      accepted_at: deal.accepted_at,
    });
  }

  return rows.sort(
    (a, b) =>
      (b.outstanding ?? 0) - (a.outstanding ?? 0) ||
      a.company_name.localeCompare(b.company_name, "es")
  );
}
