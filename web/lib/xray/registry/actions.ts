import type {
  ActionRecommendation,
  ActionKind,
  ScoreSnapshot,
} from "../types";
import { SCORE_BY_ID } from "./scores";
import { radarUplift } from "../scoring";

const TEMPLATES: Omit<ActionRecommendation, "id" | "uplift" | "origin">[] = [
  {
    kind: "refinance",
    title: "Refinanciar deuda cara",
    rationale:
      "Sustituir préstamos con tipo implícito >4,5% por un pool a tipo fijo más bajo. Mejora la dimensión debt y el DSCR.",
    recommended_amount: 450_000,
    dimension_deltas: { debt: 0.12, liquidity: 0.04, payments: 0.03 },
  },
  {
    kind: "amortize",
    title: "Amortizar anticipadamente",
    rationale:
      "Usar exceso de liquidez para reducir outstanding de la línea más cara. Sube bankability a costa de liquidity a corto.",
    recommended_amount: 120_000,
    dimension_deltas: { debt: 0.1, liquidity: -0.05, payments: 0.02 },
  },
  {
    kind: "new_debt",
    title: "Reconstruir colchón de caja",
    rationale:
      "El colchón de caja está por debajo de 15 días. Inyectar liquidez cubre el hueco de tesorería; no es financiación de facturas.",
    recommended_amount: 200_000,
    dimension_deltas: { liquidity: 0.14, debt: -0.04, activity: 0.03 },
  },
  {
    kind: "extend_line",
    title: "Ampliar línea de crédito",
    rationale:
      "El uso de línea supera el 75%. Ampliar el committed reduce el riesgo de overdraft.",
    recommended_amount: 150_000,
    dimension_deltas: { liquidity: 0.1, debt: 0.02 },
  },
  {
    kind: "factoring",
    title: "Factoring de cobros",
    rationale:
      "Anticipar facturas emitidas con concentration alta. Mejora collections y liquidity.",
    recommended_amount: 180_000,
    dimension_deltas: { collections: 0.1, liquidity: 0.08, debt: -0.02 },
  },
  {
    kind: "confirming",
    title: "Confirming a proveedores",
    rationale:
      "Alargar el ciclo de pagos a proveedores estratégicos sin deteriorar el rating comercial.",
    recommended_amount: 100_000,
    dimension_deltas: { payments: 0.09, liquidity: 0.05 },
  },
];

/** Rank action templates against a score snapshot (mock or dataset-backed). */
export function actionsForSnapshot(
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

  return ranked.slice(0, 4).map((t, i) => ({
    ...t,
    id: `${companyId}-${t.kind}-${i}`,
    uplift: radarUplift(snapshot, t),
    origin: (i === 0 ? "eve" : i === 1 ? "llm" : "deterministic") as ActionRecommendation["origin"],
  }));
}

function actionsFor(companyId: string): ActionRecommendation[] {
  const snapshot = SCORE_BY_ID[companyId];
  if (!snapshot) return [];
  return actionsForSnapshot(snapshot);
}

export const ACTIONS_BY_COMPANY: Record<string, ActionRecommendation[]> =
  Object.fromEntries(
    Object.keys(SCORE_BY_ID).map((id) => [id, actionsFor(id)])
  );

export function findAction(
  companyId: string,
  actionId: string
): ActionRecommendation | undefined {
  return ACTIONS_BY_COMPANY[companyId]?.find((a) => a.id === actionId);
}

/** Resolve an action for any company — mock registry first, else derive from snapshot. */
export function resolveAction(
  companyId: string,
  actionId: string,
  snapshot?: ScoreSnapshot | null
): ActionRecommendation | undefined {
  const cached = findAction(companyId, actionId);
  if (cached) return cached;
  if (!snapshot) return undefined;
  return actionsForSnapshot(snapshot).find((a) => a.id === actionId);
}

export function actionKindLabel(kind: ActionKind): string {
  const map: Record<ActionKind, string> = {
    refinance: "Refinanciación",
    new_debt: "Nueva deuda",
    amortize: "Amortización",
    extend_line: "Línea de crédito",
    factoring: "Factoring",
    confirming: "Confirming",
  };
  return map[kind];
}

export { TEMPLATES };
