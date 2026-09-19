import { defineTool } from "eve/tools";
import { TermsDecisionSchema } from "#lib/schemas";
import { getProduct } from "@/lib/xray/catalog";

export default defineTool({
  description:
    "Submit point terms against catalog products. product_id must exist; unknown ids are dropped. Fields: amount, interest_rate, start_date, end_date. No reasoning.",
  inputSchema: TermsDecisionSchema,
  label: {
    start: ({ company_id, terms }) =>
      `Submit ${terms.length} terms for ${company_id}`,
  },
  async execute(decision) {
    const terms = decision.terms.filter((o) => getProduct(o.product_id));
    return {
      ok: true as const,
      decision: { ...decision, terms },
      dropped: decision.terms.length - terms.length,
    };
  },
});
