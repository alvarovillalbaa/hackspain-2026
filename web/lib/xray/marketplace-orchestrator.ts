/**
 * Sequential Eve pipeline: quantity → offering → match.
 *
 * Declared subagents run as background tasks. The first session.waiting is NOT
 * the decision — keep reading the parent stream until the stage schema lands
 * (child outputSchema / submit_* / result.completed).
 */
import type { Client, MessageStreamEvent } from "eve/client";
import {
  OfferDecisionSchema,
  OffersDecisionSchema,
  QuantityDecisionSchema,
  RankingDecisionSchema,
  type OfferDecision,
  type OffersDecision,
  type QuantityDecision,
  type RecommendationDecision,
} from "../../agent/lib/schemas";
import type { ActionKind, ScoreSnapshot } from "./types";
import type { MarketplacePhase } from "./marketplace-progress";
import {
  assembleRecommendation,
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

function parseOffers(candidates: unknown[]): OffersDecision | OfferDecision[] | null {
  const full = parseStageOutput(OffersDecisionSchema, candidates);
  if (full) return full;
  for (const candidate of candidates) {
    const list = Array.isArray(candidate)
      ? candidate
      : candidate &&
          typeof candidate === "object" &&
          Array.isArray((candidate as { offers?: unknown }).offers)
        ? (candidate as { offers: unknown[] }).offers
        : null;
    if (!list) continue;
    const offers: OfferDecision[] = [];
    for (const row of list) {
      const parsed = OfferDecisionSchema.safeParse(row);
      if (parsed.success) offers.push(parsed.data);
    }
    if (offers.length > 0) return offers;
  }
  return null;
}

async function consumeUntilStage<T>(input: {
  stage: MarketplaceStage;
  signal: AbortSignal;
  onEvent?: (event: MessageStreamEvent) => void;
  response: AsyncIterable<MessageStreamEvent>;
  follow: () => AsyncIterable<MessageStreamEvent>;
  parse: (candidates: unknown[]) => T | null;
}): Promise<T> {
  let parsed: T | null = null;
  let parked = false;

  const handle = (event: MessageStreamEvent) => {
    input.signal.throwIfAborted();
    input.onEvent?.(event);
    const failed = failMessage(event);
    if (failed) throw new Error(failed);
    if (event.type === "session.waiting") parked = true;
    parsed =
      parsed ??
      input.parse(extractCandidates(asPipelineEvent(event), input.stage));
  };

  for await (const event of input.response) {
    handle(event);
    if (parsed && parked) return parsed;
  }
  if (parsed) return parsed;

  for await (const event of input.follow()) {
    handle(event);
    if (parsed && parked) return parsed;
  }

  throw new Error(
    `Marketplace stage '${input.stage}' finished without a structured payload`
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

  const quantity = await withStageTimeout("quantity", input.signal, async (stageSignal) => {
    const { session, response } = await input.client.sessions.create({
      message: quantityPrompt(shared),
      outputSchema: QuantityDecisionSchema,
      signal: stageSignal,
    });
    const value = await consumeUntilStage({
      stage: "quantity",
      signal: stageSignal,
      onEvent: input.onEvent,
      response,
      follow: () => session.stream({ signal: stageSignal }),
      parse: (candidates) =>
        parseStageOutput(QuantityDecisionSchema, candidates),
    });
    return { session, value };
  });

  const quantityDecision: QuantityDecision =
    input.amount != null
      ? { ...quantity.value, ideal_amount: input.amount }
      : quantity.value;

  input.onPhase("offering", "Ofertas emisor");
  const offers = await withStageTimeout("offering", input.signal, async (stageSignal) => {
    const response = await quantity.session.send(offeringPrompt({
      company_id: input.company_id,
      action_kind: input.action_kind,
      band: input.snapshot.band,
      quantity: quantityDecision,
    }), {
      outputSchema: OffersDecisionSchema,
      signal: stageSignal,
    });
    return consumeUntilStage({
      stage: "offering",
      signal: stageSignal,
      onEvent: input.onEvent,
      response,
      follow: () => quantity.session.stream({ signal: stageSignal }),
      parse: parseOffers,
    });
  });

  input.onPhase("match", "Ranking bilateral");
  const ranking = await withStageTimeout("match", input.signal, async (stageSignal) => {
    const offerList = Array.isArray(offers) ? offers : offers.offers;
    const response = await quantity.session.send(matchPrompt({
      company_id: input.company_id,
      action_kind: input.action_kind,
      quantity: quantityDecision,
      offers: offerList,
    }), {
      outputSchema: RankingDecisionSchema,
      signal: stageSignal,
    });
    return consumeUntilStage({
      stage: "match",
      signal: stageSignal,
      onEvent: input.onEvent,
      response,
      follow: () => quantity.session.stream({ signal: stageSignal }),
      parse: (candidates) =>
        parseStageOutput(RankingDecisionSchema, candidates),
    });
  });

  return assembleRecommendation({
    company_id: input.company_id,
    action_id: input.action_id,
    action_kind: input.action_kind,
    quantity: quantityDecision,
    offers,
    ranking,
  });
}
