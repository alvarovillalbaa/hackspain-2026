import type {
  ActionKind,
  ActionRecommendation,
  CompanyRef,
  DataOrigin,
} from "./types";

/** One recommended action row for the portfolio Acciones table. */
export interface PortfolioAction extends ActionRecommendation {
  company_id: string;
  company_name: string;
}

export interface PortfolioActionInput {
  company_id: string;
  company_name: string;
  /** Deterministic grounded actions (no Eve). */
  grounded: ActionRecommendation[];
  /** Optional Blob/Eve titles overlay (same kinds). */
  stored?: ActionRecommendation[] | null;
}

/**
 * Merge grounded amounts with stored titles when present.
 * Prefer stored title/reasoning; keep grounded id/amount/uplift/deltas.
 */
export function mergePortfolioAction(
  grounded: ActionRecommendation,
  stored: ActionRecommendation | undefined
): ActionRecommendation {
  if (!stored) return grounded;
  const title = stored.title?.trim();
  const reasoning = stored.reasoning?.trim() ?? stored.rationale?.trim();
  return {
    ...grounded,
    title: title && title.length >= 4 ? title : grounded.title,
    reasoning:
      reasoning && reasoning.length >= 8 ? reasoning : grounded.reasoning,
    origin: (stored.origin ?? grounded.origin) as DataOrigin,
  };
}

/** Flatten per-company grounded (+ optional stored overlay) into a ranked portfolio list. */
export function buildPortfolioActions(
  inputs: PortfolioActionInput[],
  limit = 200
): PortfolioAction[] {
  const rows: PortfolioAction[] = [];
  for (const input of inputs) {
    const byKind = new Map(
      (input.stored ?? []).map((a) => [a.kind, a] as const)
    );
    for (const g of input.grounded) {
      const merged = mergePortfolioAction(g, byKind.get(g.kind));
      rows.push({
        ...merged,
        company_id: input.company_id,
        company_name: input.company_name,
      });
    }
  }
  return rows
    .sort(
      (a, b) =>
        b.uplift - a.uplift ||
        a.company_name.localeCompare(b.company_name, "es") ||
        a.id.localeCompare(b.id)
    )
    .slice(0, limit);
}

export function filterPortfolioActionsByGroup(
  rows: PortfolioAction[],
  companies: Pick<CompanyRef, "company_id" | "group_id">[],
  groupId: string | null | undefined
): PortfolioAction[] {
  if (!groupId) return rows;
  const companyIds = new Set(
    companies
      .filter((company) => company.group_id === groupId)
      .map((company) => company.company_id)
  );
  return rows.filter((row) => companyIds.has(row.company_id));
}

export function portfolioActionHref(row: PortfolioAction): string {
  return `/c/${row.company_id}/a/${row.id}`;
}

export type { ActionKind };
