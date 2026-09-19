// Read-only access to the pipeline outputs. Loaded once per process and cached; no interpretation here.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Row = Record<string, string>;

const ROOT = resolve(import.meta.dirname, "../..");
// Precedence: explicit env, a data/ copy inside web/ (for deployment), the repo-level pipeline outputs (local dev).
export const OUTPUTS = [
  process.env.PIPELINE_OUTPUTS,
  join(ROOT, "data"),
  join(ROOT, "../company_optimization_pipeline/outputs"),
].find((p): p is string => Boolean(p && existsSync(join(p, "company_metrics.csv"))))
  ?? join(ROOT, "data");

// Minimal RFC 4180 reader: the pipeline quotes only fields containing commas, quotes or newlines.
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter(r => r.length === header.length).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const cache = new Map<string, unknown>();
function load<T>(name: string, parse: (text: string) => T): T {
  if (!cache.has(name)) cache.set(name, parse(readFileSync(join(OUTPUTS, name), "utf8")));
  return cache.get(name) as T;
}

export const companyMetrics = () => load("company_metrics.csv", parseCsv);
export const groupMetrics = () => load("group_metrics.csv", parseCsv);
export const workingCapital = () => load("working_capital_monthly.csv", parseCsv);
export const opportunities = () => load<Opportunity[]>("opportunities.json", JSON.parse);
export const dataQuality = () => load<DataQuality>("data_quality.json", JSON.parse);

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
export interface DataQuality {
  dataset_as_of_date: string;
  notes: string[];
  company_count: number;
  stale_refinancing_schedule_count: number;
  [key: string]: unknown;
}

/** Drop empty and zero fields so tool outputs stay small; the glossary tells the model that absent = 0. */
export function compact(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== "" && v !== "0" && v !== "0.00" && v !== "0.0"));
}

export function requireCompany(companyId: string): Row[] {
  const rows = companyMetrics().filter(r => r.company_id === companyId);
  if (!rows.length) throw new Error(`Unknown company_id ${companyId}. IDs look like COMP_0058.`);
  return rows;
}

export const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function percentileRank(sorted: number[], value: number): number | null {
  if (!sorted.length) return null;
  const below = sorted.filter(v => v < value).length;
  return Math.round((100 * below) / sorted.length);
}
