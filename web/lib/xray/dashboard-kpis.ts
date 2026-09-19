import type { CompanySummary } from "./company-summary";
import type { WatchQueueItem } from "./types";

export interface DashboardKpis {
  n_companies: number;
  mean_score: number | null;
  cash_close_sum: number;
  outlook: { positive: number; stable: number; negative: number };
  watch_count: number;
  top_alerts: WatchQueueItem[];
  top_scores: CompanySummary[];
  bottom_scores: CompanySummary[];
  histogram: { bucket: string; count: number }[];
}

function bucketLabel(score: number): string {
  if (score >= 80) return "80–100";
  if (score >= 60) return "60–79";
  if (score >= 40) return "40–59";
  if (score >= 20) return "20–39";
  return "0–19";
}

const BUCKET_ORDER = ["0–19", "20–39", "40–59", "60–79", "80–100"] as const;

/** Pure KPI rollup for the Dashboard home. */
export function buildDashboardKpis(
  summaries: CompanySummary[],
  watch: WatchQueueItem[]
): DashboardKpis {
  const n = summaries.length;
  const mean_score =
    n === 0
      ? null
      : summaries.reduce((a, s) => a + s.score, 0) / n;
  const outlook = { positive: 0, stable: 0, negative: 0 };
  const cash_close_sum = summaries.reduce((a, s) => a + s.cash_close, 0);
  const hist = new Map<string, number>(BUCKET_ORDER.map((b) => [b, 0]));
  for (const s of summaries) {
    outlook[s.outlook] += 1;
    const b = bucketLabel(s.score);
    hist.set(b, (hist.get(b) ?? 0) + 1);
  }
  const byScore = [...summaries].sort((a, b) => b.score - a.score);
  return {
    n_companies: n,
    mean_score,
    cash_close_sum,
    outlook,
    watch_count: watch.length,
    top_alerts: watch.slice(0, 5),
    top_scores: byScore.slice(0, 5),
    bottom_scores: [...byScore].reverse().slice(0, 5),
    histogram: BUCKET_ORDER.map((bucket) => ({
      bucket,
      count: hist.get(bucket) ?? 0,
    })),
  };
}
