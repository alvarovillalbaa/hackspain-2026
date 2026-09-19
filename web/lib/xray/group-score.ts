/**
 * Group Health Score from member snapshots.
 * Mirrors xray.explain.group_rollup: score weighted by operating inflows
 * (here monthly_inflow_avg_3m, clipped at 1). Not a rescore of consolidated cash.
 *
 * ponytail: O(members × history). Switch to groups.parquet if the pack grows.
 */
import { scoreToBand, watchMeta } from "./bands";
import type {
  Confidence,
  Dimensions,
  HistoryPoint,
  Outlook,
  ScoreSnapshot,
  Trend,
} from "./types";
import type { ExportedScore } from "./dataset/types";

export interface GroupMemberInput {
  company_id: string;
  name: string;
  score: ExportedScore;
  /** monthly_inflow_avg_3m; used as rollup weight. */
  inflow: number;
}

export interface GroupMemberScore {
  company_id: string;
  name: string;
  score: number;
  weight: number;
}

export interface GroupScore {
  group_id: string;
  n_companies: number;
  score_min: number;
  weakest_company_id: string;
  snapshot: ScoreSnapshot;
  members: GroupMemberScore[];
}

function weightOf(inflow: number): number {
  return Math.max(1, inflow);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function weightedMean(rows: { value: number; weight: number }[]): number {
  const w = rows.reduce((s, r) => s + r.weight, 0);
  if (w <= 0) return 0;
  return rows.reduce((s, r) => s + r.value * r.weight, 0) / w;
}

function weightedMode<T extends string>(
  rows: { value: T; weight: number }[],
  tieBreak: T[]
): T {
  const acc = new Map<T, number>();
  for (const r of rows) acc.set(r.value, (acc.get(r.value) ?? 0) + r.weight);
  let best = tieBreak[0]!;
  let bestW = -1;
  for (const key of tieBreak) {
    const w = acc.get(key) ?? 0;
    if (w > bestW) {
      best = key;
      bestW = w;
    }
  }
  return best;
}

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

function worstConfidence(rows: Confidence[]): Confidence {
  let worst: Confidence = "high";
  for (const c of rows) {
    if (CONF_RANK[c] < CONF_RANK[worst]) worst = c;
  }
  return worst;
}

function projection6m(history: HistoryPoint[], scoreNow: number) {
  const delta =
    history.length >= 2
      ? history[history.length - 1]!.score -
        history[Math.max(0, history.length - 3)]!.score
      : 0;
  const spread = Math.max(4, Math.abs(delta) * 1.5 + 4);
  const clip = (v: number) => round1(Math.max(0, Math.min(100, v)));
  return {
    p10: clip(scoreNow + delta * 0.5 - spread),
    p50: clip(scoreNow + delta),
    p90: clip(scoreNow + delta * 1.2 + spread * 0.6),
  };
}

function aggregateHistory(
  members: { score: ExportedScore; weight: number }[]
): HistoryPoint[] {
  const months = new Set<string>();
  for (const m of members) {
    for (const h of m.score.history) months.add(h.month);
  }
  return [...months].sort().map((month) => {
    const rows = members.flatMap((m) => {
      const hit = m.score.history.find((h) => h.month === month);
      if (!hit) return [];
      return [{ value: hit.score, weight: m.weight }];
    });
    return { month, score: round1(weightedMean(rows)) };
  });
}

export function rollupGroup(
  groupId: string,
  members: GroupMemberInput[]
): GroupScore | null {
  if (members.length === 0) return null;

  const weighted = members.map((m) => ({
    ...m,
    weight: weightOf(m.inflow),
  }));

  const score = round1(
    weightedMean(weighted.map((m) => ({ value: m.score.score, weight: m.weight })))
  );
  const weakest = [...weighted].sort(
    (a, b) =>
      a.score.score - b.score.score ||
      (a.score.level ?? 0) - (b.score.level ?? 0) ||
      a.company_id.localeCompare(b.company_id)
  )[0]!;

  const dim = (k: keyof Dimensions) =>
    round3(
      weightedMean(
        weighted.map((m) => ({ value: m.score.dimensions[k], weight: m.weight }))
      )
    );
  const dimensions: Dimensions = {
    liquidity: dim("liquidity"),
    collections: dim("collections"),
    payments: dim("payments"),
    debt: dim("debt"),
    activity: dim("activity"),
  };

  const month = weighted
    .map((m) => m.score.month)
    .sort()
    .at(-1)!;
  const history = aggregateHistory(weighted);
  const outlook = weightedMode(
    weighted.map((m) => ({ value: m.score.outlook, weight: m.weight })),
    ["negative", "stable", "positive"] as Outlook[]
  );
  const trend = weightedMode(
    weighted.map((m) => ({ value: m.score.trend, weight: m.weight })),
    ["worsening", "flat", "improving"] as Trend[]
  );
  const watches = [
    ...new Set(weighted.map((m) => m.score.watch).filter((w): w is string => !!w)),
  ];
  const watch = watches.length ? watches.join(" · ") : null;

  const alerts: ScoreSnapshot["alerts"] = [];
  if (watch) {
    const meta = watchMeta(watch);
    alerts.push({
      id: `${groupId}-watch`,
      severity: "warning",
      message: meta.description ?? watch,
    });
  }
  for (const m of weighted) {
    const dscr = m.score.signals.dscr_6m;
    if (dscr != null && dscr > 0 && dscr < 1.2) {
      alerts.push({
        id: `${m.company_id}-dscr`,
        severity: "critical",
        message: `${m.company_id}: DSCR 6m = ${dscr.toFixed(2)} por debajo del suelo 1,2`,
      });
    }
  }

  const snapshot: ScoreSnapshot = {
    company_id: groupId,
    month,
    score,
    band: scoreToBand(score),
    outlook,
    trend,
    watch,
    confidence: worstConfidence(weighted.map((m) => m.score.confidence)),
    sub_scores: {
      bankability: Math.round(
        (dimensions.liquidity * 0.4 +
          dimensions.debt * 0.35 +
          dimensions.payments * 0.25) *
          100
      ),
      business_profile: Math.round(
        (dimensions.collections * 0.45 + dimensions.activity * 0.55) * 100
      ),
    },
    dimensions,
    peer_percentile: Math.round(
      weightedMean(
        weighted.map((m) => ({
          value: m.score.peer_percentile,
          weight: m.weight,
        }))
      )
    ),
    projection_6m: projection6m(history, score),
    history,
    drivers: weakest.score.drivers,
    alerts,
    explanation: null,
    origin: "deterministic",
  };

  return {
    group_id: groupId,
    n_companies: weighted.length,
    score_min: weakest.score.score,
    weakest_company_id: weakest.company_id,
    snapshot,
    members: weighted
      .map((m) => ({
        company_id: m.company_id,
        name: m.name,
        score: m.score.score,
        weight: m.weight,
      }))
      .sort((a, b) => a.score - b.score || a.company_id.localeCompare(b.company_id)),
  };
}
