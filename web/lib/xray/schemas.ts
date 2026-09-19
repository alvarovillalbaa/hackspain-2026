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
  liquidity: z.number(),
  collections: z.number(),
  payments: z.number(),
  debt: z.number(),
  activity: z.number(),
});

export const DimensionsSchema = z.object({
  liquidity: z.number(),
  collections: z.number(),
  payments: z.number(),
  debt: z.number(),
  activity: z.number(),
});

export const ScoreSignalsSchema = z.object({
  cash_buffer_days: z.number().nullable(),
  overdue_flow_rate_3m: z.number().nullable(),
  dscr_6m: z.number().nullable(),
  net_cash_flow_ratio_3m: z.number().nullable(),
});

export const Projection6mSchema = z.object({
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
});

export const TreasuryAlternativeSchema = z.object({
  kind: z.enum(["none", "line_draw", "line_cover", "line_open", "factoring", "loan", "refinance"]),
  amount: z.number().nonnegative(),
  rate: z.number().nonnegative().nullable(),
  expected_cost: z.number(),
  breach_prob: z.number().min(0).max(1),
  dscr_fail_prob: z.number().min(0).max(1),
  objective: z.number(),
});

export const TreasuryProjectionSchema = z.object({
  model_version: z.literal("mpc-v1"),
  currency: z.literal("EUR"),
  horizon_months: z.literal(6),
  n_paths: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
  history_months: z.number().int().positive(),
  uses_pool: z.boolean(),
  calibrated: z.literal(false),
  dscr_floor: z.number().positive(),
  risk_weight: z.number().nonnegative(),
  dscr_weight: z.number().nonnegative(),
  baseline: TreasuryAlternativeSchema.extend({ kind: z.literal("none") }),
  recommended: TreasuryAlternativeSchema,
  alternatives: z.array(TreasuryAlternativeSchema).min(1),
  cash_projection_6m: z.object({
    p10: z.number(), p50: z.number(), p90: z.number(),
  }).refine((v) => v.p10 <= v.p50 && v.p50 <= v.p90),
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
  n_signals: z.number().int().nonnegative(),
  n_red: z.number().int().nonnegative(),
  signals: ScoreSignalsSchema,
  sub_scores: SubScoresSchema,
  dimensions: DimensionsSchema,
  peer_percentile: z.number(),
  projection_6m: Projection6mSchema,
  treasury: TreasuryProjectionSchema.nullable().optional(),
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

const nullableNumber = z.number().nullable();

/** Zod mirror of `xray.evals` MethodMetrics — the pack-level metrics.json. */
export const MethodMetricsSchema = z.object({
  score_model: z.string(),
  generated_from: z.string(),
  train_until: z.string(),
  test_months: z.array(z.string()),
  n_rows: z.number().int().nonnegative(),
  n_companies: z.number().int().nonnegative(),
  n_events: z.number().int().nonnegative(),
  auc6_own: nullableNumber,
  auc6_external: nullableNumber,
  auc1_external: nullableNumber,
  lead_time: z.object({
    n_events: z.number().int().nonnegative(),
    share_crossing: z.number(),
    share_late: z.number(),
    share_chronic: z.number(),
    share_no_history: z.number(),
    median_crossing: nullableNumber,
    p25_crossing: nullableNumber,
    p75_crossing: nullableNumber,
    cutoff: z.number(),
  }),
  persistence: z.object({
    base_rate: z.number(),
    horizon_months: z.number().int(),
    p_red_given_red: z.record(z.string(), nullableNumber),
  }),
  directionality: z.record(z.string(), nullableNumber),
  projection: z.object({
    n: z.number().int().nonnegative(),
    coverage_80: nullableNumber.optional(),
    mean_width: nullableNumber.optional(),
    mae_p50: nullableNumber.optional(),
    pinball: nullableNumber.optional(),
    martingale_baseline: z.record(z.string(), nullableNumber).nullable().optional(),
  }).nullable(),
  watch: z.object({
    share_rows_with_watch: z.number(),
    n_watch: z.number().int().nonnegative(),
    p_red_3m_given_watch: nullableNumber,
    p_red_3m_given_no_watch: nullableNumber,
    kinds: z.record(z.string(), z.number().int()).default({}),
  }).nullable(),
});
