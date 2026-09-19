/** Provenance tag for every data block — greppable when wiring real systems. */
export type DataOrigin = "ml" | "llm" | "eve" | "deterministic";

export type Band =
  | "AAA"
  | "AA"
  | "A"
  | "BBB"
  | "BB"
  | "B"
  | "CCC"
  | "CC"
  | "C";

export type Outlook = "negative" | "positive" | "stable";
export type Trend = "improving" | "flat" | "worsening";
export type Confidence = "high" | "medium" | "low";

export type DimensionKey =
  | "liquidity"
  | "collections"
  | "payments"
  | "debt"
  | "activity";

export interface SubScores {
  bankability: number;
  business_profile: number;
}

export interface Dimensions {
  liquidity: number;
  collections: number;
  payments: number;
  debt: number;
  activity: number;
}

export interface Projection6m {
  p10: number;
  p50: number;
  p90: number;
}

export interface HistoryPoint {
  month: string;
  score: number;
}

export interface Driver {
  signal: string;
  delta: number;
  since: string;
}

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

/** Exact contract from docs/plan.md §6 — GET /score/{company_id}. */
export interface ScoreSnapshot {
  company_id: string;
  month: string;
  score: number;
  band: Band;
  outlook: Outlook;
  trend: Trend;
  watch: string | null;
  confidence: Confidence;
  sub_scores: SubScores;
  dimensions: Dimensions;
  peer_percentile: number;
  projection_6m: Projection6m;
  history: HistoryPoint[];
  drivers: Driver[];
  alerts: Alert[];
  explanation: string | null;
  origin?: DataOrigin;
}

export interface CompanyRef {
  company_id: string;
  group_id: string;
  name: string;
  country: string | null;
  currency: string;
  n_companies_in_group: number;
  imported?: boolean;
  /** Joined from scores export / imported pack for portfolio filters. */
  score?: number;
  band?: Band;
}

export type ActionKind =
  | "refinance"
  | "new_debt"
  | "amortize"
  | "extend_line"
  | "factoring"
  | "confirming";

export interface DimensionDeltas {
  liquidity?: number;
  collections?: number;
  payments?: number;
  debt?: number;
  activity?: number;
}

export interface ActionRecommendation {
  id: string;
  kind: ActionKind;
  title: string;
  /** Grounded deterministic "why" (amounts, screens). */
  rationale: string;
  /** Eve-authored reasoning for tooltips; falls back to rationale in UI. */
  reasoning?: string;
  /** Base score uplift at the recommended amount (points). */
  uplift: number;
  recommended_amount: number;
  dimension_deltas: DimensionDeltas;
  origin: DataOrigin;
}

/** Narrow DTO for the amortize impact dashboard (no marketplace). */
export interface AmortizeContract {
  product_id: string;
  bank_name: string;
  type: string;
  outstanding: number;
  annual_rate: number | null;
  amortization_type: string | null;
}

export interface AmortizeContext {
  company_id: string;
  cash_balance: number | null;
  contracts: AmortizeContract[];
}

export interface ProductTerms {
  rate_annual: number;
  term_months: number;
  fees_bps: number;
  amortization: "constant_quote" | "bullet" | "interest_only";
  collateral: "none" | "personal" | "asset" | "receivables";
}

export interface IssuerProfile {
  id: string;
  name: string;
  risk_appetite: Band[];
  ticket_min: number;
  ticket_max: number;
  ticket_sweet_spot: number;
  margin_target_bps: number;
}

/** Static register entry: a financial entity (lender). */
export interface CatalogEntity {
  id: string;
  name: string;
  risk_appetite: Band[];
  ticket_min: number;
  ticket_max: number;
  ticket_sweet_spot: number;
  margin_target_bps: number;
}

/**
 * Static financing product SKU with allowable **ranges**.
 * Agents quote point terms inside these ranges — they do not invent SKUs.
 */
export interface CatalogProduct {
  product_id: string;
  entity_id: string;
  kind: Exclude<ActionKind, "amortize">;
  label: string;
  description: string;
  amount_min: number;
  amount_max: number;
  rate_min: number;
  rate_max: number;
  term_months_min: number;
  term_months_max: number;
  fees_bps_min: number;
  fees_bps_max: number;
  amortization_options: ProductTerms["amortization"][];
  collateral_options: ProductTerms["collateral"][];
}

/** Agent output: a quote against a catalog product_id (FK). */
export interface OfferingTerms {
  product_id: string;
  amount_min: number;
  amount_max: number;
  issuer_terms: ProductTerms;
  client_ideal_terms: ProductTerms;
  issuer_rationale: string;
}

export interface ProductOffer {
  product_id: string;
  issuer: IssuerProfile;
  kind: ActionKind;
  label: string;
  description: string;
  /** Terms optimized for the issuer (posted offer). */
  issuer_terms: ProductTerms;
  /** Ideal terms for the client (negotiation floor). */
  client_ideal_terms: ProductTerms;
  amount_min: number;
  amount_max: number;
}

export interface MatchBreakdown {
  client_fit: number;
  issuer_appetite: number;
  match: number;
  factors: {
    label: string;
    side: "client" | "issuer";
    score: number;
  }[];
}

export interface ProductMatch {
  product: ProductOffer;
  amount: number;
  breakdown: MatchBreakdown;
  uplift: number;
  projected_score: number;
  projected_band: Band;
  origin: DataOrigin;
  /** Agent-authored rationale (eve path only). */
  rationale?: string;
  /** Agent-authored risks (eve path only). */
  risks?: string[];
}

export interface NegotiationLever {
  id: string;
  label: string;
  description: string;
  field: keyof ProductTerms;
  /** Suggested value that closes the gap toward client ideal. */
  suggested: number | string;
  /** Expected match delta if applied. */
  match_delta: number;
  origin: DataOrigin;
}

export interface NegotiationContext {
  company_id: string;
  action_id: string;
  amount: number;
}

/** Slim facts for company-side term-improvement tips (no Eve). */
export interface TermContext {
  company_id: string;
  cash_balance: number;
  monthly_inflow_avg_3m: number;
  monthly_outflow_avg_3m: number;
  invoice_aging: {
    issued_pending: number;
    received_pending: number;
    issued_overdue: number;
    received_overdue: number;
    overdue_flow_rate_3m: number;
  };
  implied_debt_rate: number | null;
  cash_buffer_days: number | null;
  dscr_6m: number | null;
  overdue_flow_rate_3m: number | null;
}

export type TermMove =
  | "rate_annual"
  | "collateral"
  | "fees_bps"
  | "term_months"
  | "ticket";

/** Deterministic tip: how the company can improve posted terms. */
export interface TermImprovement {
  id: string;
  title: string;
  rationale: string;
  moves: TermMove[];
  /** Relative impact for sort (higher first). */
  weight: number;
  origin: DataOrigin;
}

/** Accepted marketplace offer (client-persisted). */
export interface AcceptedDeal {
  company_id: string;
  action_id: string;
  product_id: string;
  label: string;
  issuer_name: string;
  amount: number;
  projected_score: number;
  projected_band: Band;
  uplift: number;
  accepted_at: string;
}

export type DatasetKind =
  | "groups"
  | "companies"
  | "banking_products"
  | "debt_products"
  | "debt_schedule_config"
  | "transactions"
  | "invoices"
  | "balances";

export interface CanonicalField {
  key: string;
  required: boolean;
  description: string;
}

export interface DatasetSpec {
  kind: DatasetKind;
  label: string;
  description: string;
  fields: CanonicalField[];
  traps: string[];
}

export interface ColumnMapping {
  /** source header → canonical field key (or null if ignored) */
  map: Record<string, string | null>;
}

export interface CsvPreview {
  fileName: string;
  headers: string[];
  rows: string[][];
  suggestedKind: DatasetKind | null;
  byteLength: number;
}

export interface ImportRequest {
  datasets: {
    kind: DatasetKind;
    fileName: string;
    /** Full File for upload (wizard path). */
    file?: File;
    mapping: ColumnMapping;
    selected_company_ids: string[];
  }[];
  /** When set, every uploaded row is remapped onto this company (update-in-place). */
  target_company_id?: string;
}

export interface UnifyCompanyCoverage {
  company_id: string;
  group_id: string | null;
  row_counts: Record<string, number>;
  months: string[];
  missing_tables: string[];
  scorable: boolean;
  drop_reason: string | null;
}

export interface ImportResult {
  companies: CompanyRef[];
  summary?: {
    companies: UnifyCompanyCoverage[];
    groups: { group_id: string; n_companies: number; n_scorable: number; company_ids: string[] }[];
    warnings: string[];
    n_files: number;
    topics_present: string[];
  };
  warnings?: string[];
  watch?: {
    alerts: {
      company_id: string;
      rule_id: string;
      severity: string;
      message: string;
    }[];
    triggered: boolean;
  };
}
