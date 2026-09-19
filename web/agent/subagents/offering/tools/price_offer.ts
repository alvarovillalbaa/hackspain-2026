import { defineTool } from "eve/tools";
import { z } from "zod";
import { ActionKindSchema, ProductTermsSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Draft a priced offer shell (issuer terms + client ideal terms) for an issuer and action kind. Returns a structured draft you can edit before submit_offers.",
  inputSchema: z.object({
    issuer_id: z.string(),
    issuer_name: z.string(),
    kind: ActionKindSchema,
    target_amount: z.number().positive(),
    ticket_min: z.number(),
    ticket_max: z.number(),
    margin_target_bps: z.number(),
    fair_rate: z.number().min(0).max(0.5),
    incumbent: z.boolean().default(false),
  }),
  label: {
    start: ({ issuer_name, kind }) => `Price ${kind} @ ${issuer_name}`,
  },
  async execute(input) {
    const spread = input.incumbent ? 0.002 : 0.008;
    const issuerRate = Math.min(0.2, input.fair_rate + spread + input.margin_target_bps / 20_000);
    const clientRate = Math.max(0.01, input.fair_rate - 0.005);
    const term = input.kind === "factoring" || input.kind === "confirming" ? 12 : 48;
    const feesIssuer = Math.round(60 + input.margin_target_bps / 4);
    const feesClient = Math.round(feesIssuer * 0.5);

    const issuer_terms = ProductTermsSchema.parse({
      rate_annual: Math.round(issuerRate * 10_000) / 10_000,
      term_months: Math.max(12, term - 6),
      fees_bps: feesIssuer,
      amortization: input.kind === "extend_line" ? "interest_only" : "constant_quote",
      collateral: input.kind === "factoring" ? "receivables" : "none",
    });
    const client_ideal_terms = ProductTermsSchema.parse({
      rate_annual: Math.round(clientRate * 10_000) / 10_000,
      term_months: term + 12,
      fees_bps: feesClient,
      amortization: "constant_quote",
      collateral: "none",
    });

    const amount_min = Math.max(input.ticket_min, Math.round(input.target_amount * 0.5));
    const amount_max = Math.min(input.ticket_max, Math.round(input.target_amount * 2));

    return {
      product_id: `PROD_${input.kind}_${input.issuer_id}`,
      issuer_id: input.issuer_id,
      issuer_name: input.issuer_name,
      kind: input.kind,
      label: `${input.kind} · ${input.issuer_name}`,
      description: input.incumbent
        ? `Oferta preferente por relación existente con ${input.issuer_name}.`
        : `Oferta ${input.issuer_name} para ticket ~€${Math.round(input.target_amount / 1000)}k.`,
      amount_min,
      amount_max: Math.max(amount_min + 50_000, amount_max),
      issuer_terms,
      client_ideal_terms,
      issuer_rationale: input.incumbent
        ? `Incumbent bank — lower CAC and known cash-flow pattern.`
        : `Priced at fair rate ${input.fair_rate} + margin ${input.margin_target_bps} bps.`,
    };
  },
});
