import "server-only";

import type { CompanyRef, ScoreSnapshot } from "../types";
import { snapshotFromExported } from "../snapshot";
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "./types";

export { snapshotFromExported } from "../snapshot";

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

export type DatasetGroup = {
  group_id: string;
  n_companies: number;
  company_ids: string[];
  /** Min/max Health Score among scored members (null if none scored). */
  score_min: number | null;
  score_max: number | null;
};

/** Unique groups from the fact pack, with optional score range for /start. */
export function listDatasetGroups(): DatasetGroup[] {
  const byGroup = new Map<string, string[]>();
  for (const c of companies) {
    const list = byGroup.get(c.group_id) ?? [];
    list.push(c.company_id);
    byGroup.set(c.group_id, list);
  }
  return [...byGroup.entries()]
    .map(([group_id, company_ids]) => {
      const scores = company_ids
        .map((id) => scoresById.get(id)?.score)
        .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
      return {
        group_id,
        n_companies: company_ids.length,
        company_ids: [...company_ids].sort(),
        score_min: scores.length ? Math.min(...scores) : null,
        score_max: scores.length ? Math.max(...scores) : null,
      };
    })
    .sort((a, b) => a.group_id.localeCompare(b.group_id));
}

export function groupExists(groupId: string): boolean {
  return companies.some((c) => c.group_id === groupId);
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
 */
export function buildScoreSnapshot(companyId: string): ScoreSnapshot | null {
  const row = scoresById.get(companyId);
  if (!row) return null;
  return snapshotFromExported(row);
}

export function hasDataset(): boolean {
  return companies.length > 0 && scoresList.length > 0;
}
