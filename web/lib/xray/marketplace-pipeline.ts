/**
 * Quantity → offering → match: parse subagent events, assemble the decision,
 * never invent numbers. The LLM only chooses ids/text; reassembleMatches
 * recomputes match/uplift.
 *
 * Nested topology: root → financing_finale → {quantity,offering,match}.
 */
import type { z } from "zod";
import {
  TermsDecisionSchema,
  TermQuoteSchema,
  QuantityDecisionSchema,
  RankingDecisionSchema,
  RecommendationDecisionSchema,
  type TermQuote,
  type TermsDecision,
  type QuantityDecision,
  type RankingDecision,
  type RecommendationDecision,
} from "../../agent/lib/schemas";
import { MARKETPLACE_STAGE_PREFIX } from "../../agent/lib/model";
import type { ActionKind } from "./types";
import type { MarketplacePhase } from "./marketplace-progress";

export type PipelineEvent = {
  type: string;
  data?: Record<string, unknown>;
};

const STAGE_NAMES = ["quantity", "offering", "match"] as const;
export type MarketplaceStage = (typeof STAGE_NAMES)[number];

/** Parent of quantity/offering/match under the nested Eve tree. */
export const FINANCING_FINALE = "financing_finale";

function tryJson(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

function walkCandidates(value: unknown, into: unknown[]): void {
  if (value == null) return;
  into.push(value);
  const nested = tryJson(value);
  if (nested !== value) {
    into.push(nested);
    value = nested;
  }
  if (typeof value !== "object") return;
  const rec = value as Record<string, unknown>;
  for (const key of [
    "decision",
    "data",
    "output",
    "result",
    "quantity",
    "terms",
    "offers",
    "ranking",
  ]) {
    if (key in rec) into.push(rec[key]);
  }
}

export function extractCandidates(
  event: PipelineEvent,
  stage?: MarketplaceStage
): unknown[] {
  const out: unknown[] = [];
  const data = event.data ?? {};

  if (event.type === "result.completed") {
    walkCandidates(data.result, out);
  }
  if (event.type === "action.result") {
    walkCandidates(data.result, out);
    walkCandidates(data.output, out);
  }
  if (event.type === "subagent.completed") {
    const name = String(data.subagentName ?? data.name ?? "");
    if (!stage || name === stage) walkCandidates(data.output, out);
  }
  if (event.type === "subagent.event") {
    const name = String(data.subagentName ?? data.name ?? "");
    const inner = data.event;
    if (
      (!stage || name === stage || name === FINANCING_FINALE) &&
      inner &&
      typeof inner === "object"
    ) {
      out.push(...extractCandidates(inner as PipelineEvent, stage));
    }
  }
  return out;
}

export function financingFinaleSessionFor(
  event: PipelineEvent
): string | null {
  if (event.type !== "subagent.called") return null;
  const data = event.data ?? {};
  const name = String(data.name ?? data.toolName ?? "");
  const id = data.childSessionId;
  return name === FINANCING_FINALE && typeof id === "string" ? id : null;
}

/**
 * Declared subagents run as background tasks: the parent's tool call returns
 * `{status:"working"}` at once and the decision lands on the CHILD session
 * stream. `subagent.called` (parent follow stream) carries its id.
 */
export function childSessionFor(
  event: PipelineEvent,
  stage: MarketplaceStage
): string | null {
  if (event.type !== "subagent.called") return null;
  const data = event.data ?? {};
  const name = String(data.name ?? data.toolName ?? "");
  const id = data.childSessionId;
  return name === stage && typeof id === "string" ? id : null;
}

/** True when financing_finale (or a legacy direct stage) was dispatched. */
export function delegatedTo(
  event: PipelineEvent,
  stage: MarketplaceStage
): boolean {
  if (event.type === "subagent.completed") {
    const name = String(event.data?.subagentName ?? event.data?.name ?? "");
    return name === stage || name === FINANCING_FINALE;
  }
  return (
    financingFinaleSessionFor(event) != null ||
    childSessionFor(event, stage) != null
  );
}

export function parseStageOutput<T>(
  schema: z.ZodType<T>,
  candidates: unknown[]
): T | null {
  for (const candidate of candidates) {
    const direct = schema.safeParse(candidate);
    if (direct.success) return direct.data;
    if (candidate && typeof candidate === "object") {
      const rec = candidate as Record<string, unknown>;
      for (const key of ["decision", "data", "output", "result"]) {
        if (!(key in rec)) continue;
        const nested = schema.safeParse(rec[key]);
        if (nested.success) return nested.data;
      }
    }
  }
  return null;
}

export function phaseFromEvent(event: PipelineEvent): MarketplacePhase | null {
  if (event.type === "subagent.called" || event.type === "subagent.started") {
    const name = String(
      event.data?.name ?? event.data?.toolName ?? event.data?.subagentName ?? ""
    );
    if (name === "quantity" || name === "offering" || name === "match") {
      return name;
    }
    if (name === FINANCING_FINALE) return "queued";
  }
  if (event.type === "actions.requested") {
    const actions = event.data?.actions;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        if (!action || typeof action !== "object") continue;
        const rec = action as Record<string, unknown>;
        const name = String(rec.name ?? rec.toolName ?? rec.subagentName ?? "");
        if (name === "quantity" || name === "offering" || name === "match") {
          return name;
        }
      }
    }
  }
  return null;
}

export function decisionWithAmount(
  decision: RecommendationDecision,
  amount: number
): RecommendationDecision {
  return {
    ...decision,
    quantity: { ...decision.quantity, ideal_amount: amount },
  };
}

function asTerms(terms: TermsDecision | TermQuote[]): TermQuote[] {
  return Array.isArray(terms) ? terms : terms.terms;
}

export function assembleRecommendation(input: {
  company_id: string;
  action_id: string;
  action_kind: ActionKind;
  quantity: QuantityDecision;
  terms: TermsDecision | TermQuote[];
  ranking: RankingDecision;
}): RecommendationDecision {
  const terms = asTerms(input.terms);
  const winnerId = input.ranking.ranking[0]?.product_id;
  const winner = terms.find((o) => o.product_id === winnerId);
  const amount = Math.round(input.quantity.ideal_amount);
  const headline = [
    winner?.product_id ?? "Producto recomendado",
    `€${amount.toLocaleString("es-ES")}`,
    "quantity → terms → match",
  ].join(" · ");

  return RecommendationDecisionSchema.parse({
    company_id: input.company_id,
    action_id: input.action_id,
    action_kind: input.action_kind,
    quantity: {
      ...input.quantity,
      company_id: input.company_id,
      action_kind: input.action_kind,
    },
    terms,
    ranking: input.ranking.ranking,
    headline,
  });
}

function stageBrief(body: string[]): string {
  return [
    `${MARKETPLACE_STAGE_PREFIX} — call \`financing_finale\` exactly once.`,
    "Do not call quantity, offering or match yourself — they nest under financing_finale.",
    "Pass financing_finale this brief unchanged:",
    "---",
    ...body,
    "---",
    "Reply with one short line after dispatching.",
  ].join("\n");
}

export function quantityPrompt(input: {
  company_id: string;
  action_id: string;
  action_kind: ActionKind;
  recommended_amount: number;
  dimension_deltas: unknown;
  band: string;
  score: number;
  amount?: number;
}): string {
  return stageBrief(
    [
      `${MARKETPLACE_STAGE_PREFIX} 1/3 — QUANTITY ONLY.`,
      "Call the `quantity` subagent exactly once. Do not call offering or match.",
      "Its QuantityDecision is read from the subagent session; reply with one short line after dispatching.",
      `company_id: ${input.company_id}`,
      `action_id: ${input.action_id}`,
      `action_kind: ${input.action_kind}`,
      `recommended_amount: ${input.amount ?? input.recommended_amount}`,
      `dimension_deltas: ${JSON.stringify(input.dimension_deltas)}`,
      `band: ${input.band}`,
      `score: ${input.score}`,
      input.amount != null
        ? `The advisor locked the ticket at ${input.amount}. Use that as ideal_amount unless DSCR forbids it.`
        : "",
      "Subagent message must include company_id, action_kind, recommended_amount and dimension_deltas.",
    ].filter(Boolean)
  );
}

export function offeringPrompt(input: {
  company_id: string;
  action_kind: ActionKind;
  band: string;
  quantity: QuantityDecision;
}): string {
  return stageBrief([
    `${MARKETPLACE_STAGE_PREFIX} 2/3 — TERMS ONLY.`,
    "Call the `offering` subagent exactly once. Do not call quantity or match.",
    "Its TermsDecision is read from the subagent session; reply with one short line after dispatching.",
    `company_id: ${input.company_id}`,
    `action_kind: ${input.action_kind}`,
    `target_amount: ${input.quantity.ideal_amount}`,
    `band: ${input.band}`,
    `quantity_decision: ${JSON.stringify(input.quantity)}`,
    "Quote point terms (amount, interest_rate, start_date, end_date) inside catalog ranges. Optimize for the issuer. No reasoning field.",
  ]);
}

export function matchPrompt(input: {
  company_id: string;
  action_kind: ActionKind;
  quantity: QuantityDecision;
  terms: TermQuote[];
}): string {
  return stageBrief([
    `${MARKETPLACE_STAGE_PREFIX} 3/3 — MATCH ONLY.`,
    "Call the `match` subagent exactly once. Do not call quantity or offering.",
    "Its RankingDecision is read from the subagent session; reply with one short line after dispatching.",
    `company_id: ${input.company_id}`,
    `action_kind: ${input.action_kind}`,
    `amount: ${input.quantity.ideal_amount}`,
    "Structured terms (no marketing prose):",
    JSON.stringify(input.terms),
    "Write reasoning only. Do NOT invent match%. Server sorts by match%.",
  ]);
}

export const STAGE_SCHEMAS = {
  quantity: QuantityDecisionSchema,
  offering: TermsDecisionSchema,
  match: RankingDecisionSchema,
} as const;
