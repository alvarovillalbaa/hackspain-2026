import { z } from "zod";

export const ActionKindSchema = z.enum([
  "refinance",
  "new_debt",
  "amortize",
  "extend_line",
  "factoring",
  "confirming",
]);

export const ProductTermsSchema = z.object({
  rate_annual: z.number().min(0).max(0.5),
  term_months: z.number().int().min(1).max(360),
  fees_bps: z.number().min(0).max(1000),
  amortization: z.enum(["constant_quote", "bullet", "interest_only"]),
  collateral: z.enum(["none", "personal", "asset", "receivables"]),
});

/** Quantity agent structured decision — amount before any product exists. */
export const QuantityDecisionSchema = z.object({
  company_id: z.string(),
  action_kind: ActionKindSchema,
  ideal_amount: z.number().positive(),
  amount_min: z.number().nonnegative(),
  amount_max: z.number().positive(),
  /** Why not more — required to prevent "more is always better". */
  ceiling_reason: z.string().min(8),
  rationale: z.string().min(8),
  risks: z.array(z.string()).default([]),
});

export type QuantityDecision = z.infer<typeof QuantityDecisionSchema>;

export const OfferDecisionSchema = z.object({
  product_id: z.string(),
  issuer_id: z.string(),
  issuer_name: z.string(),
  kind: ActionKindSchema,
  label: z.string(),
  description: z.string(),
  amount_min: z.number().nonnegative(),
  amount_max: z.number().positive(),
  issuer_terms: ProductTermsSchema,
  client_ideal_terms: ProductTermsSchema,
  /** Why this issuer would underwrite — never a match score. */
  issuer_rationale: z.string().min(8),
});

export const OffersDecisionSchema = z.object({
  company_id: z.string(),
  action_kind: ActionKindSchema,
  target_amount: z.number().positive(),
  offers: z.array(OfferDecisionSchema).min(1).max(8),
});

export type OffersDecision = z.infer<typeof OffersDecisionSchema>;
export type OfferDecision = z.infer<typeof OfferDecisionSchema>;

export const RankedOfferSchema = z.object({
  product_id: z.string(),
  /** Deterministic match from compute_match tool — not invented. */
  match: z.number().min(0).max(1),
  client_fit: z.number().min(0).max(1),
  issuer_appetite: z.number().min(0).max(1),
  rationale: z.string().min(4),
  risks: z.array(z.string()).default([]),
});

export const RankingDecisionSchema = z.object({
  company_id: z.string(),
  action_kind: ActionKindSchema,
  amount: z.number().positive(),
  ranking: z.array(RankedOfferSchema).min(1),
});

export type RankingDecision = z.infer<typeof RankingDecisionSchema>;

/**
 * Orchestrator output — decisions only.
 * Server recomputes every ProductMatch figure via lib/xray/match.ts.
 */
export const RecommendationDecisionSchema = z.object({
  company_id: z.string(),
  action_id: z.string(),
  action_kind: ActionKindSchema,
  quantity: QuantityDecisionSchema,
  offers: z.array(OfferDecisionSchema).min(1),
  ranking: z.array(RankedOfferSchema).min(1),
  headline: z.string().min(8),
});

export type RecommendationDecision = z.infer<
  typeof RecommendationDecisionSchema
>;

export const IssuerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  risk_appetite: z.array(
    z.enum(["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C"])
  ),
  ticket_min: z.number(),
  ticket_max: z.number(),
  ticket_sweet_spot: z.number(),
  margin_target_bps: z.number(),
  incumbent: z.boolean().optional(),
});
