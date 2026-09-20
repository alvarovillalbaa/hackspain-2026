import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveFacts, getLiveScore } from "#lib/facts";
import { computeMatch, fitContext } from "#lib/engine";
import { ActionKindSchema, ProductTermsSchema } from "#lib/schemas";
import type { Band } from "@/lib/xray/types";

export default defineTool({
  description:
    "Deterministic bilateral match: harmonic mean of client_fit and issuer_appetite. Returns the authoritative match number.",
  inputSchema: z.object({
    company_id: z.string(),
    product_id: z.string(),
    kind: ActionKindSchema,
    amount: z.number().positive(),
    amount_min: z.number(),
    amount_max: z.number(),
    issuer: z.object({
      id: z.string(),
      name: z.string(),
      risk_appetite: z.array(z.string()),
      ticket_min: z.number(),
      ticket_max: z.number(),
      ticket_sweet_spot: z.number(),
      margin_target_bps: z.number(),
    }),
    terms: ProductTermsSchema,
  }),
  label: {
    start: ({ product_id }) => `Match ${product_id}`,
  },
  async execute(input) {
    const snapshot = await getLiveScore(input.company_id);
    if (!snapshot) return { error: `Unknown company ${input.company_id}` };

    const product = {
      product_id: input.product_id,
      issuer: {
        ...input.issuer,
        risk_appetite: input.issuer.risk_appetite as Band[],
      },
      kind: input.kind,
      label: input.product_id,
      description: "",
      issuer_terms: input.terms,
      client_ideal_terms: input.terms,
      amount_min: input.amount_min,
      amount_max: input.amount_max,
    };

    const ctx = fitContext(snapshot, await getLiveFacts(input.company_id));
    const breakdown = computeMatch(
      product,
      input.amount,
      snapshot.band,
      input.terms,
      ctx
    );

    return {
      product_id: input.product_id,
      breakdown,
      match: breakdown.match,
      client_fit: breakdown.client_fit,
      issuer_appetite: breakdown.issuer_appetite,
    };
  },
});
