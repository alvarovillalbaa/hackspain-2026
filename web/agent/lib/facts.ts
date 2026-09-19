/**
 * Fact-pack accessors for eve tools.
 * Prefer relative imports of the JSON so the eve bundler resolves them.
 * Score figures come only from the Python export (scores.json), unless an
 * imported pack overlays them (re-score after CSV upload).
 */
import { snapshotFromExported } from "../../lib/xray/snapshot";
import { readImportedPack } from "../../lib/xray/store";
import type { CompanyRef, ScoreSnapshot } from "../../lib/xray/types";
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "../../lib/xray/dataset/types";

import companiesJson from "../../lib/xray/dataset/companies.json";
import factsJson from "../../lib/xray/dataset/facts.json";
import scoresJson from "../../lib/xray/dataset/scores.json";

const companies = companiesJson as DatasetCompany[];
const factsList = factsJson as CompanyFacts[];
const scoresList = scoresJson as ExportedScore[];

const factsById = new Map(factsList.map((f) => [f.company_id, f] as const));
const companyById = new Map(companies.map((c) => [c.company_id, c] as const));
const scoresById = new Map(scoresList.map((s) => [s.company_id, s] as const));

function companyRefFromDataset(c: DatasetCompany): CompanyRef {
  return {
    company_id: c.company_id,
    group_id: c.group_id,
    name: c.name,
    country: c.country,
    currency: c.currency,
    n_companies_in_group: c.n_companies_in_group,
  };
}

export function getCompany(companyId: string): CompanyRef | null {
  const c = companyById.get(companyId);
  if (!c) return null;
  return companyRefFromDataset(c);
}

export async function getLiveCompany(
  companyId: string
): Promise<CompanyRef | null> {
  const pack = await readImportedPack(companyId);
  if (pack?.company) return pack.company;
  return getCompany(companyId);
}

export function getFacts(companyId: string): CompanyFacts | null {
  return factsById.get(companyId) ?? null;
}

/** Raw Python export row (ranks, signals, driver_detail) for analyst tools. */
export function getExportedScore(companyId: string): ExportedScore | null {
  return scoresById.get(companyId) ?? null;
}

export async function getLiveExportedScore(
  companyId: string
): Promise<ExportedScore | null> {
  const pack = await readImportedPack(companyId);
  if (pack?.score) return pack.score;
  return getExportedScore(companyId);
}

export async function getLiveFacts(
  companyId: string
): Promise<CompanyFacts | null> {
  const pack = await readImportedPack(companyId);
  if (pack?.facts) return pack.facts;
  return getFacts(companyId);
}

function dimensionsFromRow(companyId: string, row: ExportedScore) {
  return {
    company_id: companyId,
    month: row.month,
    dimensions: row.dimensions,
    signals: {
      cash_buffer_days: row.signals.cash_buffer_days ?? 0,
      overdue_flow_rate_3m: row.signals.overdue_flow_rate_3m ?? 0,
      dscr_6m: row.signals.dscr_6m ?? 0,
      net_cash_flow_ratio_3m: row.signals.net_cash_flow_ratio_3m ?? 0,
    },
    ranks: row.ranks,
    history: row.history,
    peer_percentile: row.peer_percentile,
    confidence: row.confidence,
    outlook: row.outlook,
    watch: row.watch,
  };
}

/** Dimensions for radar / offering tools — from the Python export. */
export function getDimensions(companyId: string) {
  const row = scoresById.get(companyId);
  if (!row) return null;
  return dimensionsFromRow(companyId, row);
}

export async function getLiveDimensions(companyId: string) {
  const row = await getLiveExportedScore(companyId);
  if (!row) return null;
  return dimensionsFromRow(companyId, row);
}

/** ScoreSnapshot from the Python Health Scorer — never recomputed here. */
export function getScore(companyId: string): ScoreSnapshot | null {
  const row = scoresById.get(companyId);
  if (!row) return null;
  return snapshotFromExported(row);
}

export async function getLiveScore(
  companyId: string
): Promise<ScoreSnapshot | null> {
  const row = await getLiveExportedScore(companyId);
  if (!row) return null;
  return snapshotFromExported(row);
}
