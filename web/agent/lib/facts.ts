/**
 * Fact-pack accessors for eve tools.
 * Prefer relative imports of the JSON so the eve bundler resolves them.
 */
import type { CompanyRef, ScoreSnapshot } from "../../lib/xray/types";
import { scoreFromDimensions } from "../../lib/xray/scoring";
import { scoreToBand } from "../../lib/xray/bands";
import type {
  CompanyFacts,
  DatasetCompany,
  DatasetDimensions,
} from "../../lib/xray/dataset/types";

import companiesJson from "../../lib/xray/dataset/companies.json";
import dimensionsJson from "../../lib/xray/dataset/dimensions.json";
import factsJson from "../../lib/xray/dataset/facts.json";

const companies = companiesJson as DatasetCompany[];
const dimensionsList = dimensionsJson as DatasetDimensions[];
const factsList = factsJson as CompanyFacts[];

const dimensionsById = new Map(
  dimensionsList.map((d) => [d.company_id, d] as const)
);
const factsById = new Map(factsList.map((f) => [f.company_id, f] as const));
const companyById = new Map(companies.map((c) => [c.company_id, c] as const));

export function getCompany(companyId: string): CompanyRef | null {
  const c = companyById.get(companyId);
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

export function getFacts(companyId: string): CompanyFacts | null {
  return factsById.get(companyId) ?? null;
}

export function getDimensions(companyId: string): DatasetDimensions | null {
  return dimensionsById.get(companyId) ?? null;
}

export function getScore(companyId: string): ScoreSnapshot | null {
  const dim = dimensionsById.get(companyId);
  if (!dim) return null;

  const score = scoreFromDimensions(dim.dimensions);
  const band = scoreToBand(score);
  const bankability = Math.round(
    (dim.dimensions.liquidity * 0.4 +
      dim.dimensions.debt * 0.35 +
      dim.dimensions.payments * 0.25) *
      100
  );
  const business_profile = Math.round(
    (dim.dimensions.collections * 0.45 + dim.dimensions.activity * 0.55) *
      100
  );

  return {
    company_id: companyId,
    month: dim.month,
    score,
    band,
    outlook: dim.outlook,
    watch: dim.watch,
    confidence: dim.confidence,
    sub_scores: { bankability, business_profile },
    dimensions: dim.dimensions,
    peer_percentile: dim.peer_percentile,
    projection_6m: {
      p10: Math.max(0, Math.min(100, score - 8)),
      p50: score,
      p90: Math.max(0, Math.min(100, score + 6)),
    },
    history: dim.history,
    drivers: [],
    alerts: dim.watch
      ? [{ id: "watch", severity: "warning", message: dim.watch }]
      : [],
    explanation: null,
    origin: "deterministic",
  };
}
