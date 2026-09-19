import { defineTool } from "eve/tools";
import { OffersDecisionSchema } from "#lib/schemas";
import { getProduct } from "@/lib/xray/catalog";

export default defineTool({
  description:
    "Submit the final set of catalog quotes. product_id must exist in the registry; unknown ids are dropped. Do not include match scores.",
  inputSchema: OffersDecisionSchema,
  label: {
    start: ({ company_id, offers }) =>
      `Submit ${offers.length} offers for ${company_id}`,
  },
  async execute(decision) {
    const offers = decision.offers.filter((o) => getProduct(o.product_id));
    return {
      ok: true as const,
      decision: { ...decision, offers },
      dropped: decision.offers.length - offers.length,
    };
  },
});
