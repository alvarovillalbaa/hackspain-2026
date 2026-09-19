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
  risks: z.array(z.string()).optional().default([]),
});

export type QuantityDecision = z.infer<typeof QuantityDecisionSchema>;

/**
 * Offering agent output: a quote against a catalog product_id.
 * label/description/kind/issuer are filled from the catalog at reassemble time;
 * optional fields kept for backward compatibility with warm JSON.
 */
export const OfferDecisionSchema = z.object({
  product_id: z.string(),
  /** Optional — server fills from catalog when missing. */
  issuer_id: z.string().optional(),
  issuer_name: z.string().optional(),
  kind: ActionKindSchema.optional(),
  label: z.string().optional(),
  description: z.string().optional(),
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
  risks: z.array(z.string()).optional().default([]),
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

/** Ficha actions: agent writes copy; server keeps amounts/uplift from the tool. */
export const FichaActionPickSchema = z.object({
  kind: ActionKindSchema,
  title: z.string().min(4),
  /** Why this action for THIS company — no invented amounts. Used as tooltip. */
  rationale: z.string().min(8),
  /** Preferred tooltip copy when present; falls back to rationale. */
  reasoning: z.string().min(8).optional(),
});

export const FichaActionsDecisionSchema = z.object({
  company_id: z.string(),
  actions: z.array(FichaActionPickSchema).max(4),
});

export type FichaActionsDecision = z.infer<typeof FichaActionsDecisionSchema>;

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

/** Structured watcher alert — must match evaluateWatch() output, never invented. */
export const WatchRuleIdSchema = z.enum([
  "outlook_negative_worsening",
  "watch_event",
  "dscr_floor",
]);

export const WatchAlertSchema = z.object({
  company_id: z.string(),
  month: z.string(),
  rule_id: WatchRuleIdSchema,
  severity: z.enum(["warning", "critical"]),
  message: z.string().min(4),
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

export const NotifyChannelSchema = z.enum(["slack", "email"]);

export const SubmitAlertsSchema = z.object({
  company_id: z.string().regex(/^COMP_\d{4}$/).optional(),
  alerts: z.array(WatchAlertSchema).min(1),
  notify: z.array(NotifyChannelSchema).min(1).default(["slack", "email"]),
  /** Short Spanish copy for the channel message body (figures must match alerts). */
  copy: z.string().min(8).optional(),
});

export type SubmitAlertsInput = z.infer<typeof SubmitAlertsSchema>;
