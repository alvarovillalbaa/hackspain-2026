import { z } from "zod";

export const BandSchema = z.enum([
  "AAA",
  "AA",
  "A",
  "BBB",
  "BB",
  "B",
  "CCC",
  "CC",
  "C",
]);

export const OutlookSchema = z.enum(["negative", "positive", "stable"]);
export const TrendSchema = z.enum(["improving", "flat", "worsening"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const DataOriginSchema = z.enum(["ml", "llm", "eve", "deterministic"]);

export const SubScoresSchema = z.object({
  bankability: z.number(),
  business_profile: z.number(),
});

export const DimensionsSchema = z.object({
  liquidity: z.number(),
  collections: z.number(),
  payments: z.number(),
  debt: z.number(),
  activity: z.number(),
});

export const Projection6mSchema = z.object({
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
});

export const HistoryPointSchema = z.object({
  month: z.string(),
  score: z.number(),
});

export const DriverSchema = z.object({
  signal: z.string(),
  delta: z.number(),
  since: z.string(),
});

export const AlertSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string(),
});

/** Zod mirror of docs/plan.md §6 — change here when the contract changes. */
export const ScoreSnapshotSchema = z.object({
  company_id: z.string(),
  month: z.string(),
  score: z.number(),
  band: BandSchema,
  outlook: OutlookSchema,
  trend: TrendSchema,
  watch: z.string().nullable(),
  confidence: ConfidenceSchema,
  sub_scores: SubScoresSchema,
  dimensions: DimensionsSchema,
  peer_percentile: z.number(),
  projection_6m: Projection6mSchema,
  history: z.array(HistoryPointSchema),
  drivers: z.array(DriverSchema),
  alerts: z.array(AlertSchema),
  explanation: z.string().nullable(),
  origin: DataOriginSchema.optional(),
});

export const CompanyRefSchema = z.object({
  company_id: z.string(),
  group_id: z.string(),
  name: z.string(),
  country: z.string().nullable(),
  currency: z.string(),
  n_companies_in_group: z.number(),
  imported: z.boolean().optional(),
  score: z.number().optional(),
  band: BandSchema.optional(),
});

export const ActionKindSchema = z.enum([
  "refinance",
  "new_debt",
  "amortize",
  "extend_line",
  "factoring",
  "confirming",
]);

export const ActionRecommendationSchema = z.object({
  id: z.string(),
  kind: ActionKindSchema,
  title: z.string(),
  rationale: z.string(),
  reasoning: z.string().optional(),
  uplift: z.number(),
  recommended_amount: z.number(),
  dimension_deltas: DimensionsSchema.partial(),
  origin: DataOriginSchema,
});
