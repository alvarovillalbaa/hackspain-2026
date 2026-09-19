import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  clampAmountBounds,
  clampTerms,
  getEntity,
  getProduct,
  priceWithinCatalog,
} from "@/lib/xray/catalog";
import { ProductTermsSchema } from "#lib/schemas";

export default defineTool({
  description:
    "Propose point terms for an existing catalog product_id. Clamps rate/term/fees/amount into the product's allowable ranges. Never invents a new product_id.",
  inputSchema: z.object({
    product_id: z.string(),
    target_amount: z.number().positive(),
    fair_rate: z.number().min(0).max(0.5),
    incumbent: z.boolean().default(false),
    /** Optional overrides — still clamped to catalog ranges. */
    issuer_terms: ProductTermsSchema.optional(),
    client_ideal_terms: ProductTermsSchema.optional(),
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
    const client_ideal_terms = clampTerms(
      product,
      input.client_ideal_terms ?? priced.client_ideal_terms
    );
    const bounds = clampAmountBounds(
      product,
      priced.amount_min,
      priced.amount_max
    );

    return {
      product_id: product.product_id,
      issuer_id: entity.id,
      issuer_name: entity.name,
      kind: product.kind,
      label: product.label,
      description: product.description,
      amount_min: bounds.amount_min,
      amount_max: bounds.amount_max,
      issuer_terms,
      client_ideal_terms,
      issuer_rationale: input.incumbent
        ? `Incumbent — quoted inside ${product.label} ranges (${product.rate_min * 100}–${product.rate_max * 100}%).`
        : `Quoted inside catalog ranges for ${product.label} at fair ${input.fair_rate}.`,
      ranges: {
        rate_min: product.rate_min,
        rate_max: product.rate_max,
        amount_min: product.amount_min,
        amount_max: product.amount_max,
      },
    };
  },
});
