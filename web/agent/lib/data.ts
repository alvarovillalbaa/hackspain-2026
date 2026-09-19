/**
 * Read-only access to the committed fact pack for Eve analyst tools.
 * No dependency on gitignored company_optimization_pipeline/outputs/.
 */
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "../../lib/xray/dataset/types";

import companiesJson from "../../lib/xray/dataset/companies.json";
import factsJson from "../../lib/xray/dataset/facts.json";
import scoresJson from "../../lib/xray/dataset/scores.json";

type Row = Record<string, string>;

const companies = companiesJson as DatasetCompany[];
const factsList = factsJson as CompanyFacts[];
const scoresList = scoresJson as ExportedScore[];

const companyById = new Map(companies.map((c) => [c.company_id, c] as const));
const factsById = new Map(factsList.map((f) => [f.company_id, f] as const));
const scoresById = new Map(scoresList.map((s) => [s.company_id, s] as const));

function s(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

/** One metric row per company (EUR), shaped like the former pipeline CSV. */
function buildCompanyMetricRows(): Row[] {
  return companies.map((c) => {
    const f = factsById.get(c.company_id);
    const sc = scoresById.get(c.company_id);
    const cash = f?.cash_balance ?? 0;
    const debt = Object.values(f?.debt_by_type ?? {}).reduce(
      (a, v) => a + Math.abs(v.outstanding),
      0
    );
    const rate = f?.implied_debt_rate ?? 0;
    const idle = Math.min(Math.max(cash, 0), debt);
    const overduePos = f?.invoice_aging.issued_overdue ?? 0;
    const overdueNeg = f?.invoice_aging.received_overdue ?? 0;
    const history = sc?.months_of_history ?? f?.cash_series.length ?? 0;
    const refinancing = (f?.contracts ?? [])
      .filter((x) => x.annual_rate != null && x.annual_rate > 0)
      .reduce((a, x) => a + Math.abs(x.outstanding ?? 0), 0);
    const annualInterest = (f?.contracts ?? []).reduce((a, x) => {
      if (x.annual_rate == null || x.outstanding == null) return a;
      return a + Math.abs(x.outstanding) * x.annual_rate;
    }, 0);

    return {
      company_id: c.company_id,
      group_id: c.group_id,
      company_currency: c.currency || "EUR",
      metric_currency: c.currency || "EUR",
      booked_transaction_count: s(
        f?.cash_series.reduce((a, m) => a + m.tx_count, 0) ?? 0
      ),
      fee_transaction_count: "0",
      history_months: s(history),
      booked_outflow: s(f?.monthly_outflow_avg_3m ?? 0),
      booked_inflow: s(f?.monthly_inflow_avg_3m ?? 0),
      interest_charge_outflow: s(annualInterest / 4), // ~3m proxy
      fee_outflow: "0",
      debt_repayment_outflow: "0",
      cash_balance: s(cash),
      debt_outstanding_abs_proxy: s(debt),
      idle_cash_vs_debt: s(idle),
      implied_debt_rate_raw: s(rate),
      implied_debt_rate: s(Math.min(rate, 0.25)),
      idle_cash_savings_proxy: s(idle * Math.min(rate, 0.25)),
      loc_granted: "0",
      loc_drawn: "0",
      loc_undrawn: "0",
      overdue_invoice_abs_exposure: s(overduePos + overdueNeg),
      overdue_pending_positive: s(overduePos),
      overdue_pending_negative: s(overdueNeg),
      overdue_invoice_count: "0",
      duplicate_candidate_abs_amount: "0",
      duplicate_candidate_count: "0",
      reconciliation_pending_abs_amount: "0",
      reconciliation_discarded_abs_amount: "0",
      collection_refund_outflow: "0",
      annual_interest_cost_proxy: s(annualInterest),
      refinancing_outstanding: s(refinancing),
      debt_product_count: s(f?.contracts.length ?? 0),
      debt_sign_warning: debt > 0 ? "absolute values from fact pack" : "no debt observed",
    };
  });
}

function buildWorkingCapital(): Row[] {
  const rows: Row[] = [];
  for (const f of factsList) {
    const c = companyById.get(f.company_id);
    const cur = c?.currency || "EUR";
    let cashEnd = f.cash_balance;
    // Reconstruct backwards from as-of balance using monthly net (newest last).
    const series = [...f.cash_series].reverse();
    const rebuilt: { month: string; cash: number; m: (typeof f.cash_series)[0] }[] = [];
    for (const m of series) {
      rebuilt.push({ month: m.month, cash: cashEnd, m });
      cashEnd -= m.net;
    }
    rebuilt.reverse();
    for (const { month, cash, m } of rebuilt) {
      rows.push({
        company_id: f.company_id,
        currency: cur,
        month,
        inflow: s(m.inflow),
        outflow: s(m.outflow),
        net: s(m.net),
        collection_inflow: s(m.inflow * 0.85),
        debt_service_outflow: s(m.outflow * 0.05),
        cash_end_proxy: s(cash),
        receivables_open: s(f.invoice_aging.issued_pending),
        receivables_overdue: s(f.invoice_aging.issued_overdue),
        receivables_overdue_90d: s(f.invoice_aging.issued_overdue * 0.4),
        payables_open: s(f.invoice_aging.received_pending),
        receivables_late_days_p50: "",
      });
    }
  }
  return rows;
}

function buildGroupMetrics(): Row[] {
  const byGroup = new Map<string, DatasetCompany[]>();
  for (const c of companies) {
    const list = byGroup.get(c.group_id) ?? [];
    list.push(c);
    byGroup.set(c.group_id, list);
  }
  const rows: Row[] = [];
  for (const [group_id, members] of byGroup) {
    const currencies = new Set(members.map((m) => m.currency || "EUR"));
    for (const currency of currencies) {
      const subset = members.filter((m) => (m.currency || "EUR") === currency);
      let groupCash = 0;
      let groupDebt = 0;
      let companyOffset = 0;
      let rateSum = 0;
      let rateN = 0;
      for (const m of subset) {
        const f = factsById.get(m.company_id);
        const cash = Math.max(f?.cash_balance ?? 0, 0);
        const debt = Object.values(f?.debt_by_type ?? {}).reduce(
          (a, v) => a + Math.abs(v.outstanding),
          0
        );
        groupCash += cash;
        groupDebt += debt;
        companyOffset += Math.min(cash, debt);
        if (f?.implied_debt_rate) {
          rateSum += f.implied_debt_rate;
          rateN += 1;
        }
      }
      const incremental = Math.max(0, Math.min(groupCash, groupDebt) - companyOffset);
      const pooled = rateN ? rateSum / rateN : 0;
      rows.push({
        group_id,
        currency,
        company_count: s(subset.length),
        group_cash_positive: s(groupCash),
        group_debt: s(groupDebt),
        company_level_offset: s(companyOffset),
        group_netting_incremental: s(incremental),
        pooled_implied_rate: s(pooled),
        group_netting_savings_proxy: s(incremental * pooled),
      });
    }
  }
  return rows;
}

export interface ProductEvidence {
  product_id: string;
  outstanding: string;
  outstanding_source: string;
  rate: string;
  interest_type: string;
  annual_interest_cost_proxy: string;
  next_payment_date: string;
  stale_schedule: boolean;
}

export interface Opportunity {
  company_id: string;
  currency: string;
  opportunity_type: string;
  screening_value: string;
  evidence_metric: string;
  caveat: string;
  currency_rank: number | null;
  rank_scope: string;
  product_evidence?: ProductEvidence[];
  refinancing_outstanding?: string;
  annual_interest_cost_proxy?: string;
  product_count?: number;
}

function buildOpportunities(): Opportunity[] {
  const opps: Opportunity[] = [];
  for (const f of factsList) {
    const c = companyById.get(f.company_id);
    const currency = c?.currency || "EUR";
    const cash = Math.max(f.cash_balance, 0);
    const debt = Object.values(f.debt_by_type).reduce(
      (a, v) => a + Math.abs(v.outstanding),
      0
    );
    const idle = Math.min(cash, debt);
    const rate = Math.min(f.implied_debt_rate ?? 0, 0.25);
    if (idle > 10_000 && rate > 0) {
      opps.push({
        company_id: f.company_id,
        currency,
        opportunity_type: "idle_cash_review",
        screening_value: s(idle * rate),
        evidence_metric: "idle_cash_savings_proxy",
        caveat: "Proxy: assumes idle cash could repay highest-cost debt; covenants unknown.",
        currency_rank: null,
        rank_scope: "currency_and_type",
      });
    }
    if (f.invoice_aging.received_overdue > 5_000) {
      opps.push({
        company_id: f.company_id,
        currency,
        opportunity_type: "overdue_invoice_review",
        screening_value: s(f.invoice_aging.received_overdue),
        evidence_metric: "overdue_pending_negative",
        caveat: "Overdue payables from invoices; confirm status with ERP.",
        currency_rank: null,
        rank_scope: "currency_and_type",
      });
    }
    const scheduled = f.contracts.filter(
      (x) => x.annual_rate != null && x.annual_rate > 0 && (x.outstanding ?? 0) !== 0
    );
    if (scheduled.length) {
      const outstanding = scheduled.reduce(
        (a, x) => a + Math.abs(x.outstanding ?? 0),
        0
      );
      const annual = scheduled.reduce(
        (a, x) => a + Math.abs(x.outstanding ?? 0) * (x.annual_rate ?? 0),
        0
      );
      opps.push({
        company_id: f.company_id,
        currency,
        opportunity_type: "refinancing_screen",
        screening_value: s(annual),
        evidence_metric: "annual_interest_cost_proxy",
        caveat: "Screen only — fees, maturity and eligibility unknown. Variable rates are spreads.",
        currency_rank: null,
        rank_scope: "currency_and_type",
        refinancing_outstanding: s(outstanding),
        annual_interest_cost_proxy: s(annual),
        product_count: scheduled.length,
        product_evidence: scheduled.map((x) => ({
          product_id: x.product_id,
          outstanding: s(Math.abs(x.outstanding ?? 0)),
          outstanding_source: "debt_schedule_config",
          rate: s(x.annual_rate ?? 0),
          interest_type: x.interest_type ?? "fixed",
          annual_interest_cost_proxy: s(
            Math.abs(x.outstanding ?? 0) * (x.annual_rate ?? 0)
          ),
          next_payment_date: "",
          stale_schedule: false,
        })),
      });
    }
  }

  // Assign currency_rank within type (1 = largest screening_value).
  const byType = new Map<string, Opportunity[]>();
  for (const o of opps) {
    const key = `${o.currency}|${o.opportunity_type}`;
    const list = byType.get(key) ?? [];
    list.push(o);
    byType.set(key, list);
  }
  for (const list of byType.values()) {
    list.sort(
      (a, b) => Number(b.screening_value) - Number(a.screening_value)
    );
    list.forEach((o, i) => {
      o.currency_rank = i + 1;
    });
  }
  return opps;
}

export interface DataQuality {
  dataset_as_of_date: string;
  notes: string[];
  company_count: number;
  stale_refinancing_schedule_count: number;
  [key: string]: unknown;
}

let _metrics: Row[] | null = null;
let _wc: Row[] | null = null;
let _groups: Row[] | null = null;
let _opps: Opportunity[] | null = null;

export const companyMetrics = (): Row[] => {
  if (!_metrics) _metrics = buildCompanyMetricRows();
  return _metrics;
};

export const groupMetrics = (): Row[] => {
  if (!_groups) _groups = buildGroupMetrics();
  return _groups;
};

export const workingCapital = (): Row[] => {
  if (!_wc) _wc = buildWorkingCapital();
  return _wc;
};

export const opportunities = (): Opportunity[] => {
  if (!_opps) _opps = buildOpportunities();
  return _opps;
};

export const dataQuality = (): DataQuality => ({
  dataset_as_of_date: "2026-09-01",
  notes: [
    "Fact pack from docs/data/raw via build:facts + xray-export-web.",
    "Analyst metrics are derived views over committed JSON — not the screening pipeline CSVs.",
  ],
  company_count: companies.length,
  stale_refinancing_schedule_count: 0,
});

/** Drop empty and zero fields so tool outputs stay small. */
export function compact(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).filter(
      ([, v]) => v !== "" && v !== "0" && v !== "0.00" && v !== "0.0"
    )
  );
}

export function requireCompany(companyId: string): Row[] {
  const rows = companyMetrics().filter((r) => r.company_id === companyId);
  if (!rows.length) {
    throw new Error(`Unknown company_id ${companyId}. IDs look like COMP_0058.`);
  }
  return rows;
}

export const num = (v: string | undefined) =>
  v === undefined || v === "" ? null : Number(v);

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
  );
  return sorted[idx] ?? null;
}

export function percentileRank(sorted: number[], value: number): number | null {
  if (!sorted.length) return null;
  const below = sorted.filter((v) => v < value).length;
  return Math.round((100 * below) / sorted.length);
}
