import type { Dimensions, HistoryPoint } from "../types";

/** Compact company record for the portfolio list. */
export interface DatasetCompany {
  company_id: string;
  group_id: string;
  name: string;
  country: string | null;
  currency: string;
  n_companies_in_group: number;
}

/** Per-company dimensions + signals (legacy shape; prefer ExportedScore). */
export interface DatasetDimensions {
  company_id: string;
  month: string;
  dimensions: Dimensions;
  signals: {
    cash_buffer_days: number;
    overdue_flow_rate_3m: number;
    dscr_6m: number;
    net_cash_flow_ratio_3m: number;
  };
  ranks: {
    cash_buffer_days: number;
    overdue_flow_rate_3m: number;
    dscr_6m: number;
    net_cash_flow_ratio_3m: number;
  };
  history: HistoryPoint[];
  peer_percentile: number;
  confidence: "high" | "medium" | "low";
  outlook: "negative" | "positive" | "stable";
  watch: string | null;
}

/** One row from `xray-export-web` → scores.json (Python Health Scorer). */
export interface ExportedScore {
  company_id: string;
  month: string;
  score: number;
  level: number | null;
  state_index: number | null;
  outlook: "negative" | "positive" | "stable";
  trend: "improving" | "flat" | "worsening";
  watch: string | null;
  confidence: "high" | "medium" | "low";
  n_signals: number;
  n_red: number;
  months_of_history: number;
  signals: {
    cash_buffer_days: number | null;
    overdue_flow_rate_3m: number | null;
    dscr_6m: number | null;
    net_cash_flow_ratio_3m: number | null;
  };
  ranks: {
    cash_buffer_days: number;
    overdue_flow_rate_3m: number;
    dscr_6m: number;
    net_cash_flow_ratio_3m: number;
  };
  rank_balance: number;
  rank_overdue: number;
  rank_dscr: number;
  rank_inflows: number;
  dimensions: Dimensions;
  peer_percentile: number;
  history: HistoryPoint[];
  drivers: { signal: string; delta: number; since: string }[];
  driver_detail?: unknown[];
  projection_6m: { p10: number; p50: number; p90: number };
  origin?: "ml" | "deterministic";
}

export interface MonthlyCash {
  month: string;
  inflow: number;
  outflow: number;
  net: number;
  tx_count: number;
}

export interface DebtContract {
  product_id: string;
  type: string;
  bank_name: string;
  granted: number | null;
  outstanding: number | null;
  annual_rate: number | null;
  amortization_type: string | null;
  total_periods: number | null;
  interest_type: string | null;
}

export interface InvoiceAging {
  issued_pending: number;
  received_pending: number;
  issued_overdue: number;
  received_overdue: number;
  overdue_flow_rate_3m: number;
}

export interface CounterpartyShare {
  counterparty_id: string;
  amount: number;
  share: number;
}

/** Deep facts for agent tools — one record per company. */
export interface CompanyFacts {
  company_id: string;
  cash_balance: number;
  monthly_inflow_avg_3m: number;
  monthly_outflow_avg_3m: number;
  incumbent_banks: string[];
  debt_by_type: Record<string, { count: number; outstanding: number; granted: number }>;
  contracts: DebtContract[];
  cash_series: MonthlyCash[];
  invoice_aging: InvoiceAging;
  top_counterparties: CounterpartyShare[];
  implied_debt_rate: number | null;
}
