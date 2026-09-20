/**
 * After a marketplace deal is approved, persist a new imported pack.
 * Prefer Python POST /ingest on the stored CSVs; fall back to the TS what-if.
 */
import type { CompanyFacts, ExportedScore } from "./dataset/types";
import { buildFactsFromTables } from "./facts-builder";
import {
  applyDealToTables,
  ensureCompanyRow,
  parseDealActionKind,
} from "./import-source";
import { ingestCanonicalTables } from "./ingest-client";
import { invalidateRecommendCache } from "./recommend-cache";
import { listCompanyActions } from "./recommend-actions";
import { applyAction, publishedProjection } from "./scoring";
import { snapshotFromExported } from "./snapshot";
import {
  invalidateActions,
  readImportedPack,
  readImportSource,
  writeImportedPack,
  writeImportSource,
} from "./store";
import type { AcceptedDeal, ActionKind, ActionRecommendation, CompanyRef } from "./types";

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function mutateFactsForDeal(
  facts: CompanyFacts | null,
  deal: AcceptedDeal,
  action: ActionRecommendation
): CompanyFacts | null {
  if (!facts) return null;
  const next: CompanyFacts = {
    ...facts,
    debt_by_type: { ...facts.debt_by_type },
    contracts: [...facts.contracts],
  };
  const amount = deal.amount;

  if (action.kind === "amortize") {
    next.cash_balance = Math.max(0, next.cash_balance - amount);
    // Reduce outstanding on first non-zero contract / type bucket.
    let left = amount;
    next.contracts = next.contracts.map((c) => {
      if (left <= 0 || !c.outstanding) return c;
      const pay = Math.min(Math.abs(c.outstanding), left);
      left -= pay;
      const sign = c.outstanding < 0 ? -1 : 1;
      return { ...c, outstanding: sign * (Math.abs(c.outstanding) - pay) };
    });
  } else {
    // new_debt / refinance / extend_line / factoring / confirming → cash in + contract.
    next.cash_balance = next.cash_balance + amount;
    next.contracts.push({
      product_id: `deal-${deal.product_id}`,
      type: action.kind === "extend_line" ? "lineofcredit" : "loan",
      bank_name: deal.issuer_name,
      outstanding: amount,
      granted: amount,
      annual_rate: null,
      amortization_type: null,
      total_periods: null,
      interest_type: null,
    });
    const key = action.kind === "extend_line" ? "lineofcredit" : "loan";
    const prev = next.debt_by_type[key];
    next.debt_by_type[key] = {
      count: (prev?.count ?? 0) + 1,
      outstanding: (prev?.outstanding ?? 0) + amount,
      granted: (prev?.granted ?? 0) + amount,
    };
  }
  return next;
}

function applyScoreToExported(
  exported: ExportedScore,
  action: ActionRecommendation,
  amount: number
): ExportedScore {
  const snap = snapshotFromExported(exported);
  const proj = publishedProjection(snap, action, amount);
  const after = applyAction(snap, action, amount);
  const delta = proj.uplift;
  return {
    ...exported,
    score: proj.after,
    outlook: after.outlook,
    trend: after.trend,
    dimensions: after.dimensions,
    projection_6m: {
      p10: clampScore(exported.projection_6m.p10 + delta * 0.7),
      p50: clampScore(exported.projection_6m.p50 + delta),
      p90: clampScore(exported.projection_6m.p90 + delta * 1.1),
    },
    history: [
      ...exported.history,
      {
        month: exported.month,
        score: exported.score,
      },
    ],
    origin: "deterministic",
  };
}

async function persistPack(opts: {
  company: CompanyRef;
  score: ExportedScore;
  facts: CompanyFacts | null;
}): Promise<void> {
  await writeImportedPack({
    company: { ...opts.company, imported: true },
    score: opts.score,
    facts: opts.facts,
  });
  await invalidateActions(opts.company.company_id);
  invalidateRecommendCache(opts.company.company_id);
}

function stubCompany(companyId: string): CompanyRef {
  return {
    company_id: companyId,
    group_id: "IMPORT",
    name: companyId,
    country: null,
    currency: "EUR",
    n_companies_in_group: 1,
    imported: true,
  };
}

/**
 * Persist deal impact onto xray/imports/{id}.json and refresh actions cache.
 * Does not delete the deal.
 */
export async function materializeDealPack(deal: AcceptedDeal): Promise<boolean> {
  const companyId = deal.company_id;
  const imported = await readImportedPack(companyId);
  let company = imported?.company ?? stubCompany(companyId);
  let exported = imported?.score ?? null;
  let facts = imported?.facts ?? null;
  if (!imported) {
    // Catalog fallback — dynamic so vitest can import this module (dataset is server-only).
    const ds = await import("./dataset");
    company = ds.getDatasetCompany(companyId) ?? stubCompany(companyId);
    exported = ds.getExportedScore(companyId);
    facts = ds.getCompanyFacts(companyId);
  }

  const snapshot = exported ? snapshotFromExported(exported) : null;
  const actions = snapshot
    ? listCompanyActions(snapshot, facts, exported, company.currency)
    : [];
  const kindFromId = parseDealActionKind(deal.action_id, companyId);
  const action =
    actions.find((a) => a.id === deal.action_id) ??
    actions.find((a) => a.kind === kindFromId) ??
    actions.find((a) => deal.action_id.includes(a.kind)) ??
    actions[0];
  const kind: ActionKind | null = kindFromId ?? action?.kind ?? null;

  const source = await readImportSource(companyId);
  if (kind && source?.tables) {
    try {
      const mutated = ensureCompanyRow(
        applyDealToTables(source.tables, deal, kind),
        company
      );
      const ingest = await ingestCanonicalTables({
        tables: mutated,
        target: company,
      });
      const score =
        ingest.scores.find((s) => s.company_id === companyId) ??
        ingest.scores[0];
      if (score) {
        const nextFacts =
          buildFactsFromTables(mutated, [companyId])[0] ??
          (action ? mutateFactsForDeal(facts, deal, action) : facts);
        await persistPack({ company, score, facts: nextFacts ?? null });
        await writeImportSource(companyId, mutated);
        return true;
      }
      console.warn(
        "[deals] Python ingest returned no scores; TS overlay"
      );
    } catch (err) {
      console.warn("[deals] Python ingest failed, TS overlay:", err);
    }
  }

  if (!exported || !action) return false;

  const nextScore = applyScoreToExported(exported, action, deal.amount);
  const nextFacts = mutateFactsForDeal(facts, deal, action);
  await persistPack({ company, score: nextScore, facts: nextFacts });
  return true;
}
