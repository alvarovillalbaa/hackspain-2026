import { defineTool } from "eve/tools";
import { QuantityDecisionSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Submit the final quantity decision: exact ideal_amount, reasoning (incl. why not more), and risks.",
  inputSchema: QuantityDecisionSchema,
  label: {
    start: ({ company_id, ideal_amount }) =>
      `Submit quantity ${company_id}: €${Math.round(ideal_amount)}`,
  },
  async execute(decision) {
    return { ok: true as const, decision };
  },
});
