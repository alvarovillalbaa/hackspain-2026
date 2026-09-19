import { defineTool } from "eve/tools";
import { OffersDecisionSchema } from "#lib/schemas";

export default defineTool({
  description: "Submit the final set of issuer offers. Do not include match scores.",
  inputSchema: OffersDecisionSchema,
  label: {
    start: ({ company_id, offers }) =>
      `Submit ${offers.length} offers for ${company_id}`,
  },
  async execute(decision) {
    return { ok: true as const, decision };
  },
});
