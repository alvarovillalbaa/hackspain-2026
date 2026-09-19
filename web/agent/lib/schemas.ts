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

/** Quantity agent — exact ideal amount (no min/max). */
export const QuantityDecisionSchema = z.object({
  company_id: z.string(),
  action_kind: ActionKindSchema,
  ideal_amount: z.number().positive(),
  /** Why this ticket (incl. why not more). */
  reasoning: z.string().min(8),
  risks: z.array(z.string()).optional().default([]),
});

export type QuantityDecision = z.infer<typeof QuantityDecisionSchema>;

/**
 * Offering agent output: point terms against a catalog product_id.
 * No rationale — these are terms, not marketing copy.
 */
export const TermQuoteSchema = z.object({
  product_id: z.string(),
  amount: z.number().positive(),
  interest_rate: z.number().min(0).max(0.5),
  /** ISO date YYYY-MM-DD */
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO date YYYY-MM-DD */
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const TermsDecisionSchema = z.object({
  company_id: z.string(),
  action_kind: ActionKindSchema,
  target_amount: z.number().positive(),
  terms: z.array(TermQuoteSchema).min(1).max(8),
});

export type TermsDecision = z.infer<typeof TermsDecisionSchema>;
export type TermQuote = z.infer<typeof TermQuoteSchema>;

/** @deprecated alias — prefer TermsDecisionSchema */
export const OfferDecisionSchema = TermQuoteSchema;
/** @deprecated alias */
export const OffersDecisionSchema = TermsDecisionSchema;
export type OffersDecision = TermsDecision;
export type OfferDecision = TermQuote;

/** Match agent — reasoning only; match% is computed server-side. */
export const RankedOfferSchema = z.object({
  product_id: z.string(),
  reasoning: z.string().min(4),
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
  /** Point terms from the offering stage. */
  terms: z.array(TermQuoteSchema).min(1),
  ranking: z.array(RankedOfferSchema).min(1),
  headline: z.string().min(8),
});

export type RecommendationDecision = z.infer<
  typeof RecommendationDecisionSchema
>;

/** Ficha actions: agent writes copy; server keeps amounts/uplift from the tool. */
export const FichaActionPickSchema = z.object({
  /** Action kind (same as grounded `kind`). */
  action: ActionKindSchema,
  description: z.string().min(4),
  reasoning: z.string().min(8),
  /** Ignored if not a valid Confidence enum — server uses snapshot.confidence. */
  confidence: z.enum(["high", "medium", "low"]).optional(),
  /** Optional; server keeps grounded amount when missing. */
  amount: z.number().positive().optional(),
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
