/**
 * Size × age nearest neighbors. Size is monthly capital moved
 * (inflow + outflow, 3m avg). Age is months since created_at, or
 * months_of_history when the pack has no alta date.
 *
 * Same-currency pool when it has at least k+1 companies; otherwise
 * global, with size as within-currency percentile so JPY and EUR
 * are not compared as raw amounts.
 *
 * ponytail: O(n) scan per call. k-d tree if the pack grows past ~10k.
 */

export const DEFAULT_K = 15;
export const MIN_K = 5;
export const MAX_K = 30;

export type SizeBand = "small" | "mid" | "large";
export type AgeBand = "young" | "mid" | "mature";
export type PeerPool = "currency" | "global";
export type AgeSource = "created_at" | "history";

export interface PeerCompany {
  company_id: string;
  name: string;
  currency: string;
  /** Monthly capital moved: inflow_avg_3m + outflow_avg_3m. */
  size: number;
  ageMonths: number;
  ageSource?: AgeSource;
  score: number;
}

export interface PeerNeighbor {
  company_id: string;
  name: string;
  score: number;
  distance: number;
}

export interface PeerCohort {
  company_id: string;
  k: number;
  pool: PeerPool;
  currency: string;
  size: { monthly_flow: number; band: SizeBand; percentile: number };
  age: { months: number; band: AgeBand; source: AgeSource };
  score: number;
  peer_score_mean: number;
  delta: number;
  better_than: number;
  neighbors: PeerNeighbor[];
}

export const SIZE_BAND_LABEL: Record<SizeBand, string> = {
  small: "Pequeña",
  mid: "Mediana",
  large: "Grande",
};

export const AGE_BAND_LABEL: Record<AgeBand, string> = {
  young: "Nueva",
  mid: "Establecida",
  mature: "Madura",
};

/** API/query clamp: 5–30, default 15. */
export function parseK(k: unknown): number {
  if (k == null || k === "") return DEFAULT_K;
  const n = typeof k === "number" ? k : Number(k);
  if (!Number.isFinite(n)) return DEFAULT_K;
  return Math.min(MAX_K, Math.max(MIN_K, Math.round(n)));
}

export function ageMonthsFromCreated(
  createdAt: string,
  asOfMonth: string
): number | null {
  const t = Date.parse(createdAt);
  const [y, m] = asOfMonth.split("-").map(Number);
  if (!Number.isFinite(t) || !y || !m) return null;
  const d = new Date(t);
  return Math.max(
    0,
    (y - d.getUTCFullYear()) * 12 + (m - 1 - d.getUTCMonth())
  );
}

export function ageBand(months: number): AgeBand {
  if (months < 12) return "young";
  if (months < 19) return "mid";
  return "mature";
}

/** Average-rank percentile 0–100. */
export function percentileOf(values: number[], x: number): number {
  if (values.length === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return Math.round(((below + 0.5 * equal) / values.length) * 100);
}

function logSize(size: number): number {
  return Math.log1p(Math.max(0, size));
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function zScores(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  const std = Math.sqrt(v);
  if (std < 1e-12) return xs.map(() => 0);
  return xs.map((x) => (x - m) / std);
}

function tercile(values: number[], x: number): SizeBand {
  if (values.length === 0) return "mid";
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length / 3)]!;
  const q2 = sorted[Math.floor((2 * sorted.length) / 3)]!;
  if (q1 === q2) {
    if (x < q1) return "small";
    if (x > q2) return "large";
    return "mid";
  }
  if (x < q1) return "small";
  if (x < q2) return "mid";
  return "large";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Join the fact pack into KNN rows. Age prefers created_at over months_of_history. */
export function peerRowsFromPack(
  companies: {
    company_id: string;
    name: string;
    currency: string;
    created_at?: string | null;
  }[],
  facts: {
    company_id: string;
    monthly_inflow_avg_3m: number;
    monthly_outflow_avg_3m: number;
  }[],
  scores: {
    company_id: string;
    score: number;
    months_of_history: number;
    month: string;
  }[]
): PeerCompany[] {
  const factsById = new Map(facts.map((f) => [f.company_id, f]));
  const scoresById = new Map(scores.map((s) => [s.company_id, s]));
  return companies.flatMap((c) => {
    const f = factsById.get(c.company_id);
    const s = scoresById.get(c.company_id);
    if (!f || !s) return [];
    const fromCreated = c.created_at
      ? ageMonthsFromCreated(c.created_at, s.month)
      : null;
    return [
      {
        company_id: c.company_id,
        name: c.name,
        currency: c.currency,
        size:
          Math.max(0, f.monthly_inflow_avg_3m) +
          Math.max(0, f.monthly_outflow_avg_3m),
        ageMonths: fromCreated != null ? fromCreated : s.months_of_history,
        ageSource: fromCreated != null ? "created_at" : "history",
        score: s.score,
      },
    ];
  });
}

export function nearestPeers(
  targetId: string,
  rows: PeerCompany[],
  k = DEFAULT_K
): PeerCohort | null {
  const target = rows.find((r) => r.company_id === targetId);
  if (!target) return null;

  const take = Math.min(Math.max(1, Math.round(k)), Math.max(0, rows.length - 1));
  if (take === 0) {
    return emptyCohort(target, 0);
  }

  const sameCur = rows.filter((r) => r.currency === target.currency);
  const poolKind: PeerPool = sameCur.length >= take + 1 ? "currency" : "global";
  const pool = poolKind === "currency" ? sameCur : rows;
  const sizeInCurrency = rows
    .filter((r) => r.currency === target.currency)
    .map((r) => r.size);

  const features = pool.map((r) => {
    if (poolKind === "currency") {
      return { id: r.company_id, a: logSize(r.size), b: r.ageMonths };
    }
    const curSizes = rows
      .filter((x) => x.currency === r.currency)
      .map((x) => x.size);
    return { id: r.company_id, a: percentileOf(curSizes, r.size), b: r.ageMonths };
  });
  const zA = zScores(features.map((f) => f.a));
  const zB = zScores(features.map((f) => f.b));
  const byId = new Map(pool.map((r) => [r.company_id, r]));
  const ti = features.findIndex((f) => f.id === targetId);
  const za = zA[ti] ?? 0;
  const zb = zB[ti] ?? 0;

  const neighbors = features
    .map((f, i) => {
      if (f.id === targetId) return null;
      const row = byId.get(f.id);
      if (!row) return null;
      const distance = Math.hypot((zA[i] ?? 0) - za, (zB[i] ?? 0) - zb);
      return {
        company_id: row.company_id,
        name: row.name,
        score: row.score,
        distance: Math.round(distance * 10000) / 10000,
      };
    })
    .filter((n): n is PeerNeighbor => n != null)
    .sort(
      (a, b) => a.distance - b.distance || a.company_id.localeCompare(b.company_id)
    )
    .slice(0, take);

  const scores = neighbors.map((n) => n.score);
  const peerMean = scores.length ? round1(mean(scores)) : round1(target.score);

  return {
    company_id: target.company_id,
    k: neighbors.length,
    pool: poolKind,
    currency: target.currency,
    size: {
      monthly_flow: target.size,
      band: tercile(sizeInCurrency.map(logSize), logSize(target.size)),
      percentile: percentileOf(sizeInCurrency, target.size),
    },
    age: {
      months: target.ageMonths,
      band: ageBand(target.ageMonths),
      source: target.ageSource ?? "history",
    },
    score: target.score,
    peer_score_mean: peerMean,
    delta: round1(target.score - peerMean),
    better_than: neighbors.filter((n) => n.score < target.score).length,
    neighbors,
  };
}

function emptyCohort(target: PeerCompany, k: number): PeerCohort {
  return {
    company_id: target.company_id,
    k,
    pool: "currency",
    currency: target.currency,
    size: {
      monthly_flow: target.size,
      band: "mid",
      percentile: 50,
    },
    age: {
      months: target.ageMonths,
      band: ageBand(target.ageMonths),
      source: target.ageSource ?? "history",
    },
    score: target.score,
    peer_score_mean: round1(target.score),
    delta: 0,
    better_than: 0,
    neighbors: [],
  };
}
