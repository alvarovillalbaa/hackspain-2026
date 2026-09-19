/**
 * Sequential Eve pipeline: quantity → offering → match.
 *
 * Declared subagents run as background tasks: the parent's tool call returns
 * `{status:"working"}` and the parent turn ends with prose, so a parent-turn
 * `outputSchema` can never be fulfilled (OUTPUT_SCHEMA_NOT_FULFILLED). The
 * decision is read from the CHILD session stream (`result.completed` /
 * `submit_*`), found via `subagent.called` on the parent follow stream.
 * Each stage gets a fresh parent session; prompts are self-contained.
 */
import type { Client, MessageStreamEvent } from "eve/client";
import {
  TermQuoteSchema,
  TermsDecisionSchema,
  QuantityDecisionSchema,
  RankingDecisionSchema,
  type TermQuote,
  type TermsDecision,
  type QuantityDecision,
  type RecommendationDecision,
} from "../../agent/lib/schemas";
import type { ActionKind, ScoreSnapshot } from "./types";
import type { MarketplacePhase } from "./marketplace-progress";
import {
  assembleRecommendation,
  childSessionFor,
  delegatedTo,
  extractCandidates,
  matchPrompt,
  offeringPrompt,
  parseStageOutput,
  quantityPrompt,
  type MarketplaceStage,
  type PipelineEvent,
} from "./marketplace-pipeline";

const STAGE_MS = 90_000;

export type MarketplacePipelineInput = {
  client: Client;
  snapshot: ScoreSnapshot;
  company_id: string;
  action_id: string;
  action_kind: ActionKind;
  recommended_amount: number;
  dimension_deltas: unknown;
  amount?: number;
  signal: AbortSignal;
  onPhase: (phase: MarketplacePhase, detail?: string) => void;
  onEvent?: (event: MessageStreamEvent) => void;
};

function asPipelineEvent(event: MessageStreamEvent): PipelineEvent {
  return event as unknown as PipelineEvent;
}

function failMessage(event: MessageStreamEvent): string | null {
  if (event.type === "session.failed" || event.type === "turn.failed") {
    const data = event.data as { message?: string };
    return data.message ?? event.type;
  }
  return null;
}

function parseTerms(candidates: unknown[]): TermsDecision | TermQuote[] | null {
  const full = parseStageOutput(TermsDecisionSchema, candidates);
  if (full) return full;
  for (const candidate of candidates) {
    const list = Array.isArray(candidate)
      ? candidate
      : candidate &&
          typeof candidate === "object" &&
          Array.isArray((candidate as { terms?: unknown }).terms)
        ? (candidate as { terms: unknown[] }).terms
        : candidate &&
            typeof candidate === "object" &&
            Array.isArray((candidate as { offers?: unknown }).offers)
          ? (candidate as { offers: unknown[] }).offers
          : null;
    if (!list) continue;
    const terms: TermQuote[] = [];
    for (const row of list) {
      const parsed = TermQuoteSchema.safeParse(row);
      if (parsed.success) terms.push(parsed.data);
    }
    if (terms.length > 0) return terms;
  }
  return null;
}

async function runStage<T>(input: {
  client: Client;
  stage: MarketplaceStage;
  message: string;
  signal: AbortSignal;
  onEvent?: (event: MessageStreamEvent) => void;
  parse: (candidates: unknown[]) => T | null;
}): Promise<T> {
  const { stage, signal } = input;
  let parsed: T | null = null;
  let delegated = false;
  let childId: string | null = null;

  const handle = (event: MessageStreamEvent) => {
    signal.throwIfAborted();
    input.onEvent?.(event);
    const pe = asPipelineEvent(event);
    delegated ||= delegatedTo(pe, stage);
    childId ??= childSessionFor(pe, stage);
    parsed ??= input.parse(extractCandidates(pe, stage));
  };

  // 1. Parent turn: the orchestrator dispatches the stage subagent.
  const { session, response } = await input.client.sessions.create({
    message: input.message,
    signal,
  });
  for await (const event of response) {
    handle(event);
    if (parsed) return parsed;
    const failed = failMessage(event);
    if (failed && !delegated) throw new Error(failed);
  }
  if (!delegated) {
    throw new Error(`Marketplace stage '${stage}': orchestrator did not call ${stage}`);
  }

  // 2. `subagent.called` (with childSessionId) lands after the turn boundary.
  if (!childId) {
    for await (const event of session.stream({ signal })) {
      handle(event);
      if (parsed) return parsed;
      if (childId) break;
    }
  }
  if (!childId) {
    throw new Error(`Marketplace stage '${stage}': no child session for ${stage}`);
  }

  // 3. The decision is on the child stream.
  for await (const event of input.client.sessions.attach(childId).stream({ signal })) {
    handle(event);
    if (parsed) return parsed;
    const failed = failMessage(event);
    if (failed) throw new Error(`Marketplace stage '${stage}': ${failed}`);
    if (event.type === "session.waiting") break;
  }

  throw new Error(
    `Marketplace stage '${stage}' finished without a structured payload`
  );
}

async function withStageTimeout<T>(
  stage: MarketplaceStage,
  signal: AbortSignal,
  run: (stageSignal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeout = AbortSignal.timeout(STAGE_MS);
  const stageSignal = AbortSignal.any([signal, timeout]);
  try {
    return await run(stageSignal);
  } catch (err) {
    if (timeout.aborted) {
      throw new Error(`Marketplace stage '${stage}' timed out after ${STAGE_MS / 1000}s`);
    }
    throw err;
  }
}

export async function runMarketplacePipeline(
  input: MarketplacePipelineInput
): Promise<RecommendationDecision> {
  const shared = {
    company_id: input.company_id,
    action_id: input.action_id,
    action_kind: input.action_kind,
    recommended_amount: input.recommended_amount,
    dimension_deltas: input.dimension_deltas,
    band: input.snapshot.band,
    score: input.snapshot.score,
    amount: input.amount,
  };

  input.onPhase("queued", "Preparando pipeline");
  input.onPhase("quantity", "Importe ideal");

  const quantity = await withStageTimeout("quantity", input.signal, (stageSignal) =>
    runStage({
      client: input.client,
      stage: "quantity",
      message: quantityPrompt(shared),
      signal: stageSignal,
      onEvent: input.onEvent,
      parse: (candidates) =>
        parseStageOutput(QuantityDecisionSchema, candidates),
    })
  );

  const quantityDecision: QuantityDecision =
    input.amount != null
      ? { ...quantity, ideal_amount: input.amount }
      : quantity;

  input.onPhase("offering", "Cotizando términos");
  const terms = await withStageTimeout("offering", input.signal, (stageSignal) =>
    runStage({
      client: input.client,
      stage: "offering",
      message: offeringPrompt({
        company_id: input.company_id,
        action_kind: input.action_kind,
        band: input.snapshot.band,
        quantity: quantityDecision,
      }),
      signal: stageSignal,
      onEvent: input.onEvent,
      parse: parseTerms,
    })
  );

  input.onPhase("match", "Ranking bilateral");
  const ranking = await withStageTimeout("match", input.signal, (stageSignal) =>
    runStage({
      client: input.client,
      stage: "match",
      message: matchPrompt({
        company_id: input.company_id,
        action_kind: input.action_kind,
        quantity: quantityDecision,
        terms: Array.isArray(terms) ? terms : terms.terms,
      }),
      signal: stageSignal,
      onEvent: input.onEvent,
      parse: (candidates) =>
        parseStageOutput(RankingDecisionSchema, candidates),
    })
  );

  return assembleRecommendation({
    company_id: input.company_id,
    action_id: input.action_id,
    action_kind: input.action_kind,
    quantity: quantityDecision,
    terms,
    ranking,
  });
}
