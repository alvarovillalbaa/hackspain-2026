import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  clampTerms,
  getEntity,
  getProduct,
  priceWithinCatalog,
} from "@/lib/xray/catalog";
import { ProductTermsSchema } from "#lib/schemas";

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d ?? 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

export default defineTool({
  description:
    "Propose point terms for an existing catalog product_id. Returns amount, interest_rate, start_date, end_date clamped to catalog ranges. Never invents a new product_id.",
  inputSchema: z.object({
    product_id: z.string(),
    target_amount: z.number().positive(),
    fair_rate: z.number().min(0).max(0.5),
    incumbent: z.boolean().default(false),
    /** Optional rate/term overrides — still clamped. */
    issuer_terms: ProductTermsSchema.optional(),
    /** Optional start date YYYY-MM-DD; default = today. */
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  label: {
    start: ({ product_id }) => `Propose terms ${product_id}`,
  },
  async execute(input) {
    const product = getProduct(input.product_id);
    if (!product) {
      return { error: `Unknown catalog product_id: ${input.product_id}` };
    }
    const entity = getEntity(product.entity_id);
    if (!entity) {
      return { error: `Unknown entity for ${input.product_id}` };
    }

    const priced = priceWithinCatalog(product, input.fair_rate, {
      incumbent: input.incumbent,
      targetAmount: input.target_amount,
    });

    const issuer_terms = clampTerms(
      product,
      input.issuer_terms ?? priced.issuer_terms
    );
    const amount = Math.max(
      product.amount_min,
      Math.min(product.amount_max, input.target_amount)
    );
    const start_date =
      input.start_date ?? new Date().toISOString().slice(0, 10);
    const end_date = addMonths(start_date, issuer_terms.term_months);

    return {
      product_id: product.product_id,
      amount,
      interest_rate: issuer_terms.rate_annual,
      start_date,
      end_date,
      issuer_id: entity.id,
      issuer_name: entity.name,
      kind: product.kind,
      label: product.label,
      ranges: {
        rate_min: product.rate_min,
        rate_max: product.rate_max,
        amount_min: product.amount_min,
        amount_max: product.amount_max,
        term_months_min: product.term_months_min,
        term_months_max: product.term_months_max,
      },
    };
  },
});
