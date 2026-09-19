import type { RecommendationDecision } from "../../agent/lib/schemas";
import { RecommendationDecisionSchema } from "../../agent/lib/schemas";
import { reassembleMatches } from "../../lib/xray/reassemble";
import {
  defaultFitContext,
  solveIdealAmount,
} from "../../lib/xray/match";
import type { ProductOffer } from "../../lib/xray/types";
import {
  cvWithin,
  isUnanimous,
  relErr,
} from "./dispersion";
import {
  evalActionsForSnapshot,
  evalResolveAction,
  evalScoreSnapshot,
} from "./snapshot";
import { CV_MAX, REL_ERR_MAX } from "./thresholds";

export interface ManifestCase {
  row_id: string;
  company_id: string;
  action_id: string;
  action_kind: string;
  modes: string[];
}

export interface Manifest {
  version: number;
  cases: ManifestCase[];
}

export function orchestratorPrompt(c: ManifestCase): string {
  const snapshot = evalScoreSnapshot(c.company_id);
  if (!snapshot) throw new Error(`No snapshot for ${c.company_id}`);
  const action =
    evalResolveAction(c.company_id, c.action_id, snapshot) ??
    evalActionsForSnapshot(snapshot)[0];
  if (!action) throw new Error(`No action for ${c.company_id}/${c.action_id}`);

  return [
    "Recommend the best financing product for this company and action.",
    `company_id: ${c.company_id}`,
    `action_id: ${c.action_id}`,
    `action_kind: ${action.kind}`,
    `recommended_amount: ${action.recommended_amount}`,
    `dimension_deltas: ${JSON.stringify(action.dimension_deltas)}`,
    `band: ${snapshot.band}`,
    `score: ${snapshot.score}`,
    "Delegate quantity → offering → match. Return structured RecommendationDecision.",
  ].join("\n");
}

export function analystPrompt(companyId: string): string {
  const snapshot = evalScoreSnapshot(companyId);
  if (!snapshot) throw new Error(`No snapshot for ${companyId}`);
  const exported = {
    company_id: snapshot.company_id,
    month: snapshot.month,
    score: snapshot.score,
    outlook: snapshot.outlook,
    trend: snapshot.trend,
    confidence: snapshot.confidence,
    peer_percentile: snapshot.peer_percentile,
    dimensions: snapshot.dimensions,
    drivers: snapshot.drivers,
  };
  return [
    `Analiza la salud financiera de ${companyId}.`,
    "Aquí tienes el score ya calculado (JSON). No lo recalcules; explica y recomienda con tools.",
    "```json",
    JSON.stringify(exported, null, 2),
    "```",
    "Responde en el formato de analista (Por qué este score / Cómo mejorarlo / Otras métricas a revisar / Qué no puedo concluir).",
  ].join("\n");
}

export function parseDecision(
  raw: unknown,
  c: ManifestCase
): RecommendationDecision {
  const migrated = migrateWarmDecision(raw);
  return RecommendationDecisionSchema.parse({
    ...migrated,
    company_id: c.company_id,
    action_id: c.action_id,
    action_kind: c.action_kind,
  });
}

/** Map pre-terms warm JSON (offers + ceiling_reason) onto the live schema. */
function migrateWarmDecision(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const rec = { ...(raw as Record<string, unknown>) };
  const quantity = rec.quantity;
  if (quantity && typeof quantity === "object") {
    const q = quantity as Record<string, unknown>;
    if (q.reasoning == null) {
      q.reasoning =
        (typeof q.rationale === "string" && q.rationale) ||
        (typeof q.ceiling_reason === "string" && q.ceiling_reason) ||
        "Warm fixture amount";
    }
    delete q.amount_min;
    delete q.amount_max;
    delete q.ceiling_reason;
    delete q.rationale;
    rec.quantity = q;
  }
  if (!rec.terms && Array.isArray(rec.offers)) {
    rec.terms = (rec.offers as Record<string, unknown>[]).map((o) => {
      const issuer = (o.issuer_terms ?? {}) as Record<string, unknown>;
      const termMonths =
        typeof issuer.term_months === "number" ? issuer.term_months : 36;
      const start = "2026-09-01";
      const endDate = new Date(Date.UTC(2026, 8 + termMonths, 1));
      return {
        product_id: o.product_id,
        amount:
          typeof o.amount_min === "number"
            ? o.amount_min
            : typeof rec.quantity === "object" &&
                rec.quantity &&
                typeof (rec.quantity as { ideal_amount?: number }).ideal_amount ===
                  "number"
              ? (rec.quantity as { ideal_amount: number }).ideal_amount
              : 100_000,
        interest_rate:
          typeof issuer.rate_annual === "number" ? issuer.rate_annual : 0.05,
        start_date: start,
        end_date: endDate.toISOString().slice(0, 10),
      };
    });
    delete rec.offers;
  }
  if (Array.isArray(rec.ranking)) {
    rec.ranking = (rec.ranking as Record<string, unknown>[]).map((r) => ({
      product_id: r.product_id,
      reasoning:
        (typeof r.reasoning === "string" && r.reasoning) ||
        (typeof r.rationale === "string" && r.rationale) ||
        "Warm fixture ranking",
    }));
  }
  return rec;
}

export interface OrchestratorMetrics {
  idealAmounts: number[];
  winnerMatches: number[];
  winnerRates: number[];
  winnerTerms: number[];
  winnerProductIds: string[];
  actionKinds: string[];
  issuerMultisets: string[];
  rankingOrders: string[];
  maxAmountFidelityErr: number;
}

export function collectOrchestratorMetrics(
  decisions: RecommendationDecision[],
  c: ManifestCase
): OrchestratorMetrics {
  const snapshot = evalScoreSnapshot(c.company_id);
  if (!snapshot) throw new Error(`No snapshot for ${c.company_id}`);
  const action =
    evalResolveAction(c.company_id, c.action_id, snapshot) ??
    evalActionsForSnapshot(snapshot)[0];
  if (!action) throw new Error(`No action for ${c.company_id}`);

  const metrics: OrchestratorMetrics = {
    idealAmounts: [],
    winnerMatches: [],
    winnerRates: [],
    winnerTerms: [],
    winnerProductIds: [],
    actionKinds: [],
    issuerMultisets: [],
    rankingOrders: [],
    maxAmountFidelityErr: 0,
  };

  for (const d of decisions) {
    metrics.idealAmounts.push(d.quantity.ideal_amount);
    metrics.actionKinds.push(d.action_kind);

    const reassembled = reassembleMatches(d, snapshot, action);
    const winner = reassembled[0];
    if (!winner) continue;
    metrics.winnerProductIds.push(winner.product.product_id);
    metrics.winnerMatches.push(winner.breakdown.match);
    metrics.winnerRates.push(winner.product.issuer_terms.rate_annual);
    metrics.winnerTerms.push(winner.product.issuer_terms.term_months);
    metrics.rankingOrders.push(
      reassembled.map((m) => m.product.product_id).join(">")
    );
    metrics.issuerMultisets.push(
      [...d.terms.map((t) => t.product_id)].sort().join(",")
    );

    {
      const ctx = defaultFitContext(snapshot);
      const solverProduct: ProductOffer = {
        product_id: "solver",
        issuer: {
          id: "solver",
          name: "solver",
          risk_appetite: [snapshot.band],
          ticket_min: Math.round(d.quantity.ideal_amount * 0.5),
          ticket_max: Math.round(d.quantity.ideal_amount * 2),
          ticket_sweet_spot: action.recommended_amount,
          margin_target_bps: 200,
        },
        kind: d.action_kind,
        label: "solver",
        description: "solver",
        issuer_terms: {
          rate_annual: 0.04,
          term_months: 36,
          fees_bps: 80,
          amortization: "constant_quote",
          collateral: "none",
        },
        client_ideal_terms: {
          rate_annual: 0.035,
          term_months: 48,
          fees_bps: 50,
          amortization: "constant_quote",
          collateral: "none",
        },
        amount_min: Math.round(d.quantity.ideal_amount * 0.5),
        amount_max: Math.round(d.quantity.ideal_amount * 2),
      };
      const expectedAmount = solveIdealAmount(
        snapshot,
        action,
        solverProduct,
        ctx
      );
      metrics.maxAmountFidelityErr = Math.max(
        metrics.maxAmountFidelityErr,
        relErr(d.quantity.ideal_amount, expectedAmount)
      );
    }
  }

  return metrics;
}

export function orchestratorGates(m: OrchestratorMetrics): {
  label: string;
  ok: boolean;
  detail: string;
}[] {
  const continuous: [string, number[]][] = [
    ["quantity.ideal_amount", m.idealAmounts],
    ["winner.match", m.winnerMatches],
    ["winner.rate_annual", m.winnerRates],
    ["winner.term_months", m.winnerTerms],
  ];

  const gates: { label: string; ok: boolean; detail: string }[] = continuous.map(
    ([label, values]) => ({
      label: `cv:${label}`,
      ok: values.length === 0 || cvWithin(values, CV_MAX),
      detail: `n=${values.length}`,
    })
  );

  gates.push(
    {
      label: "unanimous:winner.product_id",
      ok: isUnanimous(m.winnerProductIds),
      detail: m.winnerProductIds.join("|"),
    },
    {
      label: "unanimous:action_kind",
      ok: isUnanimous(m.actionKinds),
      detail: m.actionKinds.join("|"),
    },
    {
      label: "unanimous:issuer_multiset",
      ok: isUnanimous(m.issuerMultisets),
      detail: m.issuerMultisets.join("|"),
    },
    {
      label: "fidelity:ideal_amount",
      ok: m.maxAmountFidelityErr <= REL_ERR_MAX,
      detail: `maxRelErr=${m.maxAmountFidelityErr.toFixed(4)}`,
    }
  );

  return gates;
}

export function rankingOrderSoft(m: OrchestratorMetrics): boolean {
  return isUnanimous(m.rankingOrders);
}
