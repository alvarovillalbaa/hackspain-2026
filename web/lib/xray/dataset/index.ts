import "server-only";

import { scoreToBand } from "../bands";
import type { CompanyRef, ScoreSnapshot, Trend } from "../types";
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "./types";

import companiesJson from "./companies.json";
import factsJson from "./facts.json";
import scoresJson from "./scores.json";

const companies = companiesJson as DatasetCompany[];
const factsList = factsJson as CompanyFacts[];
const scoresList = scoresJson as ExportedScore[];

const scoresById = new Map(
  scoresList.map((s) => [s.company_id, s] as const)
);
const factsById = new Map(factsList.map((f) => [f.company_id, f] as const));

export function listDatasetCompanies(): CompanyRef[] {
  return companies.map((c) => ({
    company_id: c.company_id,
    group_id: c.group_id,
    name: c.name,
    country: c.country,
    currency: c.currency,
    n_companies_in_group: c.n_companies_in_group,
  }));
}

export function getDatasetCompany(companyId: string): CompanyRef | null {
  const c = companies.find((x) => x.company_id === companyId);
  if (!c) return null;
  return {
    company_id: c.company_id,
    group_id: c.group_id,
    name: c.name,
    country: c.country,
    currency: c.currency,
    n_companies_in_group: c.n_companies_in_group,
  };
}

export function getExportedScore(companyId: string): ExportedScore | null {
  return scoresById.get(companyId) ?? null;
}

export function getCompanyFacts(companyId: string): CompanyFacts | null {
  return factsById.get(companyId) ?? null;
}

/**
 * ScoreSnapshot from the Python Health Scorer export (`xray-export-web`).
 * Band letter is applied here; all other figures come from scores.json.
 */
export function buildScoreSnapshot(companyId: string): ScoreSnapshot | null {
  const row = scoresById.get(companyId);
  if (!row) return null;

  const score = row.score;
  const band = scoreToBand(score);
  const dims = row.dimensions;
  const bankability = Math.round(
    (dims.liquidity * 0.4 + dims.debt * 0.35 + dims.payments * 0.25) * 100
  );
  const business_profile = Math.round(
    (dims.collections * 0.45 + dims.activity * 0.55) * 100
  );

  const alerts: ScoreSnapshot["alerts"] = [];
  if (row.watch) {
    alerts.push({
      id: `${companyId}-watch`,
      severity: "warning",
      message: row.watch,
    });
  }
  const dscr = row.signals.dscr_6m;
  if (dscr != null && dscr > 0 && dscr < 1.2) {
    alerts.push({
      id: `${companyId}-dscr`,
      severity: "critical",
      message: `DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2`,
    });
  }

  const trend: Trend =
    row.trend === "improving" || row.trend === "worsening" || row.trend === "flat"
      ? row.trend
      : "flat";

  return {
    company_id: companyId,
    month: row.month,
    score,
    band,
    outlook: row.outlook,
    trend,
    watch: row.watch,
    confidence: row.confidence,
    sub_scores: { bankability, business_profile },
    dimensions: dims,
    peer_percentile: row.peer_percentile,
    projection_6m: row.projection_6m,
    history: row.history,
    drivers: row.drivers,
    alerts,
    explanation: null,
    origin: row.origin ?? "ml",
  };
}

export function hasDataset(): boolean {
  return companies.length > 0 && scoresList.length > 0;
}
