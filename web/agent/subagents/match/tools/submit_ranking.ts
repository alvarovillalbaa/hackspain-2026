import { defineTool } from "eve/tools";
import { RankingDecisionSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Submit reasoning per product_id. Do not include match%; the server recomputes and sorts.",
  inputSchema: RankingDecisionSchema,
  label: {
    start: ({ company_id, ranking }) =>
      `Submit ranking ${company_id} (${ranking.length} offers)`,
  },
  async execute(decision) {
    return { ok: true as const, decision };
  },
});
