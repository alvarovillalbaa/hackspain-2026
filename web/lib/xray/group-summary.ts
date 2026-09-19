import { rollupGroup, type GroupMemberInput } from "./group-score";
import type { Outlook } from "./types";
import type {
  CompanyFacts,
  DatasetCompany,
  ExportedScore,
} from "./dataset/types";

export interface GroupSummary {
  group_id: string;
  name: string;
  score: number;
  outlook: Outlook;
  n_companies: number;
  best_company_id: string;
  best_company_name: string;
  cash_close: number;
  month: string;
}

function pickGroupName(
  members: { name: string; score: number }[]
): string {
  const ranked = [...members].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "es")
  );
  const holding = ranked.find((m) => /holding|grupo|group/i.test(m.name));
  return (holding ?? ranked[0])!.name;
}

export function buildGroupSummaries(
  companies: DatasetCompany[],
  scores: ExportedScore[],
  facts: CompanyFacts[]
): GroupSummary[] {
  const scoresById = new Map(scores.map((s) => [s.company_id, s] as const));
  const factsById = new Map(facts.map((f) => [f.company_id, f] as const));
  const byGroup = new Map<string, DatasetCompany[]>();
  for (const c of companies) {
    const list = byGroup.get(c.group_id) ?? [];
    list.push(c);
    byGroup.set(c.group_id, list);
  }

  const out: GroupSummary[] = [];
  for (const [groupId, members] of byGroup) {
    const inputs: GroupMemberInput[] = members.flatMap((c) => {
      const score = scoresById.get(c.company_id);
      if (!score) return [];
      return [
        {
          company_id: c.company_id,
          name: c.name,
          score,
          inflow: factsById.get(c.company_id)?.monthly_inflow_avg_3m ?? 0,
        },
      ];
    });
    const rolled = rollupGroup(groupId, inputs);
    if (!rolled) continue;
    const best = [...rolled.members].sort(
      (a, b) =>
        b.score - a.score || a.company_id.localeCompare(b.company_id)
    )[0]!;
    const cashClose = members.reduce(
      (sum, c) => sum + (factsById.get(c.company_id)?.cash_balance ?? 0),
      0
    );
    out.push({
      group_id: groupId,
      name: pickGroupName(rolled.members),
      score: rolled.snapshot.score,
      outlook: rolled.snapshot.outlook,
      n_companies: members.length,
      best_company_id: best.company_id,
      best_company_name: best.name,
      cash_close: cashClose,
      month: rolled.snapshot.month,
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, "es")
  );
}
