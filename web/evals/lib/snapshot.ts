/**
 * ScoreSnapshot builder for evals — mirrors lib/xray/dataset.buildScoreSnapshot
 * without importing `server-only` (which throws outside Next.js).
 */
import scoresJson from "../../lib/xray/dataset/scores.json";
import { scoreToBand } from "../../lib/xray/bands";
import type { ScoreSnapshot, Trend } from "../../lib/xray/types";
import type { ExportedScore } from "../../lib/xray/dataset/types";
import type {
  ActionRecommendation,
  ActionKind,
  DimensionDeltas,
} from "../../lib/xray/types";
import { applyAction, upliftPoints } from "../../lib/xray/scoring";

const scores = scoresJson as ExportedScore[];
const scoresById = new Map(scores.map((s) => [s.company_id, s] as const));

export function evalScoreSnapshot(companyId: string): ScoreSnapshot | null {
  const row = scoresById.get(companyId);
  if (!row) return null;

  const score = row.score;
  const band = scoreToBand(score);
  const dims = row.dimensions;
  const bankability = Math.round(
    (dims.liquidity * 0.4 + dims.debt * 0.35 + dims.payments * 0.25) * 100
  );
  const business_profile = Math.round(
    (dims.collections * 0.45 + dims.activity * 0.55) * 100
  );

  const alerts: ScoreSnapshot["alerts"] = [];
  if (row.watch) {
    alerts.push({
      id: `${companyId}-watch`,
      severity: "warning",
      message: row.watch,
    });
  }

  const trend: Trend =
    row.trend === "improving" ||
    row.trend === "worsening" ||
    row.trend === "flat"
      ? row.trend
      : "flat";

  return {
    company_id: companyId,
    month: row.month,
    score,
    band,
    outlook: row.outlook,
    trend,
    watch: row.watch,
    confidence: row.confidence,
    sub_scores: { bankability, business_profile },
    dimensions: dims,
    peer_percentile: row.peer_percentile,
    projection_6m: row.projection_6m,
    history: row.history,
    drivers: row.drivers,
    alerts,
    explanation: null,
    origin: row.origin ?? "ml",
  };
}

const TEMPLATES: Omit<ActionRecommendation, "id" | "uplift" | "origin">[] = [
  {
    kind: "refinance",
    title: "Refinanciar deuda cara",
    rationale: "Sustituir préstamos caros.",
    recommended_amount: 450_000,
    dimension_deltas: { debt: 0.12, liquidity: 0.04, payments: 0.03 },
  },
  {
    kind: "amortize",
    title: "Amortizar anticipadamente",
    rationale: "Usar exceso de liquidez.",
    recommended_amount: 120_000,
    dimension_deltas: { debt: 0.1, liquidity: -0.05, payments: 0.02 },
  },
  {
    kind: "new_debt",
    title: "Nueva financiación de circulante",
    rationale: "Inyectar liquidez estructural.",
    recommended_amount: 200_000,
    dimension_deltas: { liquidity: 0.14, debt: -0.04, activity: 0.03 },
  },
  {
    kind: "extend_line",
    title: "Ampliar línea de crédito",
    rationale: "Ampliar el committed.",
    recommended_amount: 150_000,
    dimension_deltas: { liquidity: 0.1, debt: 0.02 },
  },
  {
    kind: "factoring",
    title: "Factoring de cobros",
    rationale: "Anticipar facturas.",
    recommended_amount: 180_000,
    dimension_deltas: { collections: 0.1, liquidity: 0.08, debt: -0.02 },
  },
  {
    kind: "confirming",
    title: "Confirming a proveedores",
    rationale: "Alargar el ciclo de pagos.",
    recommended_amount: 100_000,
    dimension_deltas: { payments: 0.09, liquidity: 0.05 },
  },
];

/** Same ranking as registry/actions.actionsForSnapshot, without server-only. */
export function evalActionsForSnapshot(
  snapshot: ScoreSnapshot
): ActionRecommendation[] {
  const companyId = snapshot.company_id;
  const ranked = [...TEMPLATES].sort((a, b) => {
    const scoreA = Object.entries(a.dimension_deltas).reduce((s, [k, v]) => {
      const dim = snapshot.dimensions[k as keyof typeof snapshot.dimensions];
      return s + (v! > 0 ? 1 - dim : 0) * Math.abs(v!);
    }, 0);
    const scoreB = Object.entries(b.dimension_deltas).reduce((s, [k, v]) => {
      const dim = snapshot.dimensions[k as keyof typeof snapshot.dimensions];
      return s + (v! > 0 ? 1 - dim : 0) * Math.abs(v!);
    }, 0);
    return scoreB - scoreA;
  });

  return ranked.slice(0, 4).map((t, i) => {
    const after = applyAction(snapshot, t, t.recommended_amount);
    return {
      ...t,
      id: `${companyId}-${t.kind}-${i}`,
      uplift: upliftPoints(snapshot, after),
      origin: "ml" as const,
    };
  });
}

export function evalResolveAction(
  companyId: string,
  actionId: string,
  snapshot: ScoreSnapshot
): ActionRecommendation | null {
  return (
    evalActionsForSnapshot(snapshot).find((a) => a.id === actionId) ?? null
  );
}

export function evalActionByKind(
  snapshot: ScoreSnapshot,
  kind: ActionKind
): ActionRecommendation | null {
  return evalActionsForSnapshot(snapshot).find((a) => a.kind === kind) ?? null;
}

export type { DimensionDeltas };
