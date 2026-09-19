import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveScore } from "#lib/facts";
import { applyAction, upliftPoints } from "#lib/engine";
import { ActionKindSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Project score uplift if the action is taken at this amount. Deterministic via applyAction.",
  inputSchema: z.object({
    company_id: z.string(),
    action_kind: ActionKindSchema,
    amount: z.number().positive(),
    recommended_amount: z.number().positive(),
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
    start: ({ company_id, amount }) =>
      `Uplift ${company_id} @ €${Math.round(amount)}`,
  },
  async execute(input) {
    const snapshot = await getLiveScore(input.company_id);
    if (!snapshot) return { error: `Unknown company ${input.company_id}` };
    const action = {
      dimension_deltas: input.dimension_deltas,
      recommended_amount: input.recommended_amount,
    };
    const after = applyAction(snapshot, action, input.amount);
    return {
      uplift: upliftPoints(snapshot, after),
      projected_score: after.score,
      projected_band: after.band,
    };
  },
});
