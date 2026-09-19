import type { WatchQueueItem, WatchRuleId } from "./types";

export const WATCH_RULE_LABEL: Record<WatchRuleId, string> = {
  dscr_floor: "DSCR < 1,2",
  outlook_negative_worsening: "Outlook negativo",
  watch_event: "En seguimiento",
};

const RULES = new Set<WatchRuleId>([
  "dscr_floor",
  "outlook_negative_worsening",
  "watch_event",
]);

export function isWatchRuleId(value: string): value is WatchRuleId {
  return RULES.has(value as WatchRuleId);
}

/** Ranked alerts in → one row per company, first (highest) severity kept. */
export function groupWatchQueue(
  rankedAlerts: {
    company_id: string;
    severity: "warning" | "critical";
    rule_id: string;
    message: string;
    evidence: Record<string, string | number | null>;
  }[],
  names: Readonly<Record<string, string>>
): WatchQueueItem[] {
  const items: WatchQueueItem[] = [];
  const index = new Map<string, number>();

  for (const a of rankedAlerts) {
    if (!isWatchRuleId(a.rule_id)) continue;
    const at = index.get(a.company_id);
    if (at != null) {
      const item = items[at]!;
      if (!item.rules.includes(a.rule_id)) item.rules.push(a.rule_id);
      if (a.severity === "critical") item.severity = "critical";
      continue;
    }
    index.set(a.company_id, items.length);
    const score = a.evidence.score;
    items.push({
      company_id: a.company_id,
      name: names[a.company_id] ?? a.company_id,
      score: typeof score === "number" ? score : null,
      severity: a.severity,
      rules: [a.rule_id],
      message: a.message,
    });
  }
  return items;
}

/** Slack mrkdwn for the portfolio queue. */
export function formatSlackQueue(items: WatchQueueItem[]): string {
  const n = items.length;
  const header = `*X Ray Watcher* — ${n} empresa${n === 1 ? "" : "s"} en cola`;
  if (n === 0) return `${header}\nSin hits.`;
  const lines = items.map((item) => {
    const sev = item.severity === "critical" ? "crítica" : "aviso";
    const rules = item.rules.map((r) => WATCH_RULE_LABEL[r]).join(", ");
    const score = item.score != null ? ` · score ${item.score}` : "";
    return `• *${item.name}* (\`${item.company_id}\`) ${sev} · ${rules}${score}`;
  });
  return [header, "", ...lines].join("\n");
}
