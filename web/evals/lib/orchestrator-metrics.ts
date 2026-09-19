import type { RecommendationDecision } from "../../agent/lib/schemas";
import { RecommendationDecisionSchema } from "../../agent/lib/schemas";
import { reassembleMatches } from "../../lib/xray/reassemble";
import {
  computeMatch,
  defaultFitContext,
  solveIdealAmount,
} from "../../lib/xray/match";
import { getProduct, toProductOffer } from "../../lib/xray/catalog";
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
    watch: snapshot.watch,
    confidence: snapshot.confidence,
    peer_percentile: snapshot.peer_percentile,
    dimensions: snapshot.dimensions,
    drivers: snapshot.drivers,
    band: snapshot.band,
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
  return RecommendationDecisionSchema.parse({
    ...(raw as object),
    company_id: c.company_id,
    action_id: c.action_id,
    action_kind: c.action_kind,
  });
}

function offerToProduct(
  offer: RecommendationDecision["offers"][number]
): ProductOffer | null {
  const catalogProduct = getProduct(offer.product_id);
  if (!catalogProduct) return null;
  return toProductOffer(catalogProduct, {
    amount_min: offer.amount_min,
    amount_max: offer.amount_max,
    issuer_terms: offer.issuer_terms,
    client_ideal_terms: offer.client_ideal_terms,
  });
}

export interface OrchestratorMetrics {
  idealAmounts: number[];
  amountMins: number[];
  amountMaxs: number[];
  winnerMatches: number[];
  winnerClientFits: number[];
  winnerIssuerAppetites: number[];
  winnerRates: number[];
  winnerFees: number[];
  winnerTerms: number[];
  winnerProductIds: string[];
  actionKinds: string[];
  issuerMultisets: string[];
  rankingOrders: string[];
  maxMatchFidelityErr: number;
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
    amountMins: [],
    amountMaxs: [],
    winnerMatches: [],
    winnerClientFits: [],
    winnerIssuerAppetites: [],
    winnerRates: [],
    winnerFees: [],
    winnerTerms: [],
    winnerProductIds: [],
    actionKinds: [],
    issuerMultisets: [],
    rankingOrders: [],
    maxMatchFidelityErr: 0,
    maxAmountFidelityErr: 0,
  };

  for (const d of decisions) {
    metrics.idealAmounts.push(d.quantity.ideal_amount);
    metrics.amountMins.push(d.quantity.amount_min);
    metrics.amountMaxs.push(d.quantity.amount_max);
    metrics.actionKinds.push(d.action_kind);

    const winner = d.ranking[0];
    if (!winner) continue;
    metrics.winnerProductIds.push(winner.product_id);
    metrics.winnerMatches.push(winner.match);
    metrics.winnerClientFits.push(winner.client_fit);
    metrics.winnerIssuerAppetites.push(winner.issuer_appetite);
    metrics.rankingOrders.push(d.ranking.map((r) => r.product_id).join(">"));

    const offer = d.offers.find((o) => o.product_id === winner.product_id);
    if (offer) {
      metrics.winnerRates.push(offer.issuer_terms.rate_annual);
      metrics.winnerFees.push(offer.issuer_terms.fees_bps);
      metrics.winnerTerms.push(offer.issuer_terms.term_months);
    }

    metrics.issuerMultisets.push(
      [...d.offers.map((o) => o.issuer_id)].sort().join(",")
    );

    const reassembled = reassembleMatches(d, snapshot, action);
    for (const ranked of d.ranking) {
      const ground = reassembled.find(
        (m) => m.product.product_id === ranked.product_id
      );
      if (!ground) continue;
      metrics.maxMatchFidelityErr = Math.max(
        metrics.maxMatchFidelityErr,
        relErr(ranked.match, ground.breakdown.match),
        relErr(ranked.client_fit, ground.breakdown.client_fit),
        relErr(ranked.issuer_appetite, ground.breakdown.issuer_appetite)
      );
    }

    if (offer) {
      const product = offerToProduct(offer);
      if (product) {
        const ctx = defaultFitContext(snapshot);
        const amt = Math.max(
          product.amount_min,
          Math.min(product.amount_max, d.quantity.ideal_amount)
        );
        const breakdown = computeMatch(
          product,
          amt,
          snapshot.band,
          offer.issuer_terms,
          ctx
        );
        metrics.maxMatchFidelityErr = Math.max(
          metrics.maxMatchFidelityErr,
          relErr(winner.match, breakdown.match)
        );
      }
    }

    // Amount fidelity vs the quantity subagent's solver shell (same as
    // agent/subagents/quantity/tools/solve_amount.ts) — not the winner product.
    {
      const ctx = defaultFitContext(snapshot);
      const solverProduct: ProductOffer = {
        product_id: "solver",
        issuer: {
          id: "solver",
          name: "solver",
          risk_appetite: [snapshot.band],
          ticket_min: d.quantity.amount_min,
          ticket_max: d.quantity.amount_max,
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
        amount_min: d.quantity.amount_min,
        amount_max: d.quantity.amount_max,
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
    ["quantity.amount_min", m.amountMins],
    ["quantity.amount_max", m.amountMaxs],
    ["winner.match", m.winnerMatches],
    ["winner.client_fit", m.winnerClientFits],
    ["winner.issuer_appetite", m.winnerIssuerAppetites],
    ["winner.rate_annual", m.winnerRates],
    ["winner.fees_bps", m.winnerFees],
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
      label: "fidelity:match",
      ok: m.maxMatchFidelityErr <= REL_ERR_MAX,
      detail: `maxRelErr=${m.maxMatchFidelityErr.toFixed(4)}`,
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
