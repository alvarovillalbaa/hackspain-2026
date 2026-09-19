import { defineTool } from "eve/tools";
import { z } from "zod";
import { getScore } from "#lib/facts";
import { defaultFitContext, solveIdealAmount, DSCR_FLOOR } from "#lib/engine";
import { ActionKindSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Deterministic amount solver: maximize score uplift subject to DSCR ≥ 1.2 within [amount_min, amount_max].",
  inputSchema: z.object({
    company_id: z.string(),
    action_kind: ActionKindSchema,
    recommended_amount: z.number().positive(),
    amount_min: z.number().nonnegative(),
    amount_max: z.number().positive(),
    dimension_deltas: z
      .object({
        liquidity: z.number().optional(),
        collections: z.number().optional(),
        payments: z.number().optional(),
        debt: z.number().optional(),
        activity: z.number().optional(),
      })
      .default({}),
  }),
  label: {
    start: ({ company_id }) => `Solve amount ${company_id}`,
  },
  async execute(input) {
    const snapshot = getScore(input.company_id);
    if (!snapshot) return { error: `Unknown company ${input.company_id}` };

    const product = {
      product_id: "solver",
      issuer: {
        id: "solver",
        name: "solver",
        risk_appetite: [snapshot.band],
        ticket_min: input.amount_min,
        ticket_max: input.amount_max,
        ticket_sweet_spot: input.recommended_amount,
        margin_target_bps: 200,
      },
      kind: input.action_kind,
      label: "solver",
      description: "solver",
      issuer_terms: {
        rate_annual: 0.04,
        term_months: 36,
        fees_bps: 80,
        amortization: "constant_quote" as const,
        collateral: "none" as const,
      },
      client_ideal_terms: {
        rate_annual: 0.035,
        term_months: 48,
        fees_bps: 50,
        amortization: "constant_quote" as const,
        collateral: "none" as const,
      },
      amount_min: input.amount_min,
      amount_max: input.amount_max,
    };

    const ctx = defaultFitContext(snapshot);
    const ideal = solveIdealAmount(
      snapshot,
      {
        dimension_deltas: input.dimension_deltas,
        recommended_amount: input.recommended_amount,
      },
      product,
      ctx
    );

    return {
      ideal_amount: ideal,
      dscr_floor: DSCR_FLOOR,
      fit_context: ctx,
    };
  },
});
