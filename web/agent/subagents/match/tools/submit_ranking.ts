import { defineTool } from "eve/tools";
import { RankingDecisionSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Submit the final ranking. match/client_fit/issuer_appetite must equal compute_match outputs.",
  inputSchema: RankingDecisionSchema,
  label: {
    start: ({ company_id, ranking }) =>
      `Submit ranking ${company_id} (${ranking.length} offers)`,
  },
  async execute(decision) {
    return { ok: true as const, decision };
  },
});
