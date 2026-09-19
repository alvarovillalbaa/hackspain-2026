import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveFacts, getLiveScore } from "#lib/facts";
import {
  getEntity,
  listEntities,
  listProducts,
} from "@/lib/xray/catalog";
import { ActionKindSchema } from "#lib/schemas";

function bankMatchesEntity(bank: string, entityName: string): boolean {
  const b = bank.toLowerCase();
  const n = entityName.toLowerCase();
  if (n.includes("bbva") && b.includes("bbva")) return true;
  if (n.includes("santander") && b.includes("santander")) return true;
  if (n.includes("sabadell") && b.includes("sabadell")) return true;
  if (n.includes("march") && b.includes("march")) return true;
  return false;
}

export default defineTool({
  description:
    "List financing products from the static catalog (entities × SKUs with ranges). Marks incumbent when the company already banks with that entity. Filter by action kind and optional target amount.",
  inputSchema: z.object({
    company_id: z.string(),
    kind: ActionKindSchema.optional(),
    target_amount: z.number().positive().optional(),
  }),
  label: {
    start: ({ company_id, kind }) =>
      `Catalog ${kind ?? "all"} for ${company_id}`,
  },
  async execute({ company_id, kind, target_amount }) {
    const facts = await getLiveFacts(company_id);
    const score = await getLiveScore(company_id);
    const banks = facts?.incumbent_banks ?? [];
    const band = score?.band ?? undefined;

    const entities = listEntities().map((e) => ({
      ...e,
      incumbent: banks.some((b) => bankMatchesEntity(b, e.name)),
    }));

    const products = listProducts({
      kind,
      band,
      amount: target_amount,
    }).map((p) => {
      const entity = getEntity(p.entity_id);
      return {
        product_id: p.product_id,
        entity_id: p.entity_id,
        entity_name: entity?.name ?? p.entity_id,
        kind: p.kind,
        label: p.label,
        description: p.description,
        amount_min: p.amount_min,
        amount_max: p.amount_max,
        rate_min: p.rate_min,
        rate_max: p.rate_max,
        term_months_min: p.term_months_min,
        term_months_max: p.term_months_max,
        fees_bps_min: p.fees_bps_min,
        fees_bps_max: p.fees_bps_max,
        amortization_options: p.amortization_options,
        collateral_options: p.collateral_options,
        incumbent: entity
          ? banks.some((b) => bankMatchesEntity(b, entity.name))
          : false,
      };
    });

    return {
      company_id,
      band: band ?? null,
      incumbent_banks: banks,
      entities,
      products,
      note: "Select product_id from this list. Quote point terms inside the ranges — do not invent new products.",
    };
  },
});
