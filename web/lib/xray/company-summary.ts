import type { Outlook } from "./types";
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "./dataset/types";

/** Tipo actual ≥ 5 %: etiqueta dummy del frame Compañías de Figma. */
export const EXPENSIVE_RATE = 0.05;

/** Plazo residual ≤ 12 meses: “Vence en N meses”. */
export const SHORT_TENOR_MONTHS = 12;

export interface CompanySummary {
  company_id: string;
  group_id: string;
  name: string;
  score: number;
  outlook: Outlook;
  situation: string;
  implied_rate: number | null;
  cash_close: number;
  month: string;
}

export function filterCompanySummariesByGroup<
  T extends Pick<CompanySummary, "group_id">,
>(rows: T[], groupId: string | null | undefined): T[] {
  return groupId ? rows.filter((row) => row.group_id === groupId) : rows;
}

function remainingPeriods(facts: CompanyFacts | undefined): number | null {
  const periods = (facts?.contracts ?? [])
    .filter(
      (c) => (c.outstanding ?? 1) > 0 && c.total_periods != null
    )
    .map((c) => c.total_periods as number);
  if (periods.length === 0) return null;
  return Math.round(Math.min(...periods));
}

export function companySituation(facts: CompanyFacts | undefined): string {
  const periods = remainingPeriods(facts);
  if (periods != null && periods <= SHORT_TENOR_MONTHS) {
    return periods === 1 ? "Vence en 1 mes" : `Vence en ${periods} meses`;
  }
  const rate = facts?.implied_debt_rate;
  if (rate != null && rate >= EXPENSIVE_RATE) return "Deuda cara";
  return "—";
}

export function buildCompanySummaries(
  companies: DatasetCompany[],
  scores: ExportedScore[],
  facts: CompanyFacts[]
): CompanySummary[] {
  const scoresById = new Map(scores.map((s) => [s.company_id, s] as const));
  const factsById = new Map(facts.map((f) => [f.company_id, f] as const));

  const out: CompanySummary[] = [];
  for (const c of companies) {
    const score = scoresById.get(c.company_id);
    if (!score) continue;
    const f = factsById.get(c.company_id);
    out.push({
      company_id: c.company_id,
      group_id: c.group_id,
      name: c.name,
      score: score.score,
      outlook: score.outlook,
      situation: companySituation(f),
      implied_rate: f?.implied_debt_rate ?? null,
      cash_close: f?.cash_balance ?? 0,
      month: score.month,
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "es")
  );
}
