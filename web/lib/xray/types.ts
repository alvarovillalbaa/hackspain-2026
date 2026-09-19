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
  rationale: string;
  /** Base score uplift at the recommended amount (points). */
  uplift: number;
  recommended_amount: number;
  dimension_deltas: DimensionDeltas;
  origin: DataOrigin;
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
    mapping: ColumnMapping;
    selected_company_ids: string[];
  }[];
}
