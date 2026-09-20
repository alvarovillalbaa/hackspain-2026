import { NextResponse } from "next/server";
import { z } from "zod";
import { Client } from "eve/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { reassembleMatches } from "@/lib/xray/reassemble";
import {
  getCompanyFacts,
  getDatasetCompany,
  getExportedScore,
} from "@/lib/xray/dataset";
import { findRecommended, listCompanyActions } from "@/lib/xray/recommend-actions";
import { resolveLiveSnapshot } from "@/lib/xray/live-snapshot";
import { readImportedPack, readDecision, writeDecision } from "@/lib/xray/store";
import {
  getCachedDecision,
  getRecommendCache,
  quantityFromDecision,
  recommendCacheKey,
  setRecommendCache,
  type RecommendCacheEntry,
} from "@/lib/xray/recommend-cache";
import { runMarketplacePipeline } from "@/lib/xray/marketplace-orchestrator";
import {
  beginMarketplaceProgress,
  emitMarketplaceProgress,
  marketplaceProgressKey,
} from "@/lib/xray/marketplace-progress";
import { isTimeoutError, llmErrorStatus } from "@/lib/ai/errors";
import {
  decisionWithAmount,
  phaseFromEvent,
} from "@/lib/xray/marketplace-pipeline";
import type { ScoreSnapshot } from "@/lib/xray/types";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  company_id: z.string(),
  action_id: z.string(),
  amount: z.number().positive().optional(),
});

type CacheEntry = RecommendCacheEntry;

async function resolveFacts(companyId: string): Promise<{
  facts: CompanyFacts | null;
  exported: ExportedScore | null;
  currency?: string;
}> {
  const imported = await readImportedPack(companyId);
  if (imported) {
    return {
      facts: imported.facts,
      exported: imported.score,
      currency: imported.company.currency,
    };
  }
  return {
    facts: getCompanyFacts(companyId),
    exported: getExportedScore(companyId),
    currency: getDatasetCompany(companyId)?.currency,
  };
}

async function actionsFor(snapshot: ScoreSnapshot) {
  const { facts, exported, currency } = await resolveFacts(snapshot.company_id);
  // Live path: facts-backed only (no TEMPLATES).
  return listCompanyActions(snapshot, facts, exported, currency);
}

/**
 * Only the facts-backed action with this id. Substituting a different action
 * (or a TEMPLATE) would quote a marketplace for something the company was
 * never recommended, so an unknown id is an error, not a fallback.
 */
async function actionFor(actionId: string, snapshot: ScoreSnapshot) {
  return findRecommended(await actionsFor(snapshot), actionId) ?? null;
}

async function entryFromDecision(
  companyId: string,
  actionId: string,
  snapshot: ScoreSnapshot,
  decisionRaw: unknown,
  headline: string | undefined,
  source: CacheEntry["source"],
  amount?: number
): Promise<CacheEntry | null> {
  const action = await actionFor(actionId, snapshot);
  if (!action) return null;
  const { facts } = await resolveFacts(companyId);
  const parsed = RecommendationDecisionSchema.parse(decisionRaw);
  const decision =
    amount != null ? decisionWithAmount(parsed, amount) : parsed;
  return {
    matches: reassembleMatches(decision, snapshot, action, "eve", facts),
    headline: headline ?? decision.headline,
    source,
    decision: parsed,
  };
}

async function loadBlob(
  companyId: string,
  actionId: string,
  snapshot: ScoreSnapshot
): Promise<CacheEntry | null> {
  const stored = await readDecision(`${companyId}:${actionId}`);
  if (!stored?.decision) return null;
  try {
    return entryFromDecision(
      companyId,
      actionId,
      snapshot,
      stored.decision,
      stored.headline,
      "blob"
    );
  } catch {
    return null;
  }
}

function eveHost(): string {
  if (process.env.EVE_HOST) return process.env.EVE_HOST;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

async function createEveClient(): Promise<Client> {
  const host = eveHost();
  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel) {
    return new Client({
      host,
      auth: {
        vercelOidc: {
          token: async () => await getVercelOidcToken(),
        },
      },
    });
  }
  return new Client({ host });
}

async function runEveRecommendation(input: {
  company_id: string;
  action_id: string;
  amount?: number;
  snapshot: ScoreSnapshot;
  progressKey: string;
}): Promise<
  CacheEntry & { decision: z.infer<typeof RecommendationDecisionSchema> }
> {
  const action = await actionFor(input.action_id, input.snapshot);
  if (!action) {
    throw new Error(`No action for ${input.company_id}/${input.action_id}`);
  }
  const { facts } = await resolveFacts(input.company_id);

  const client = await createEveClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);

  try {
    const decision = await runMarketplacePipeline({
      client,
      snapshot: input.snapshot,
      company_id: input.company_id,
      action_id: input.action_id,
      action_kind: action.kind,
      recommended_amount: action.recommended_amount,
      dimension_deltas: action.dimension_deltas,
      amount: input.amount,
      signal: controller.signal,
      onPhase: (phase, detail) =>
        emitMarketplaceProgress(input.progressKey, { phase, detail }),
      onEvent: (event) => {
        const phase = phaseFromEvent(event);
        if (phase) {
          emitMarketplaceProgress(input.progressKey, {
            phase,
            detail: event.type,
          });
        }
      },
    });

    return {
      matches: reassembleMatches(decision, input.snapshot, action, "eve", facts),
      headline: decision.headline,
      source: "eve",
      decision,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid request", detail: String(e) },
      { status: 400 }
    );
  }

  const key = recommendCacheKey(body.company_id, body.action_id, body.amount);
  const cached = getRecommendCache(key);
  if (cached) {
    return NextResponse.json({
      matches: cached.matches,
      headline: cached.headline,
      source: cached.source,
      quantity: quantityFromDecision(cached.decision),
      cached: true,
    });
  }

  const snapshot = await resolveLiveSnapshot(body.company_id);
  if (!snapshot) {
    return NextResponse.json(
      { error: `Company not found: ${body.company_id}` },
      { status: 404 }
    );
  }

  const progressKey = marketplaceProgressKey(body.company_id, body.action_id);
  const imported = await readImportedPack(body.company_id);

  if (body.amount != null) {
    const fromMem = getCachedDecision(body.company_id, body.action_id);
    if (fromMem) {
      const reused = await entryFromDecision(
        body.company_id,
        body.action_id,
        snapshot,
        fromMem,
        fromMem.headline,
        "eve",
        body.amount
      );
      if (reused) {
        setRecommendCache(key, reused);
        return NextResponse.json({
          matches: reused.matches,
          headline: reused.headline,
          source: reused.source,
          quantity: quantityFromDecision(reused.decision),
          cached: true,
        });
      }
    }
    const fromBlob = imported
      ? null
      : await loadBlob(body.company_id, body.action_id, snapshot);
    if (fromBlob?.decision) {
      const reused = await entryFromDecision(
        body.company_id,
        body.action_id,
        snapshot,
        fromBlob.decision,
        fromBlob.headline,
        "eve",
        body.amount
      );
      if (reused) {
        setRecommendCache(key, reused);
        return NextResponse.json({
          matches: reused.matches,
          headline: reused.headline,
          source: reused.source,
          quantity: quantityFromDecision(reused.decision),
          cached: true,
        });
      }
    }
  } else if (!imported) {
    const fromBlob = await loadBlob(body.company_id, body.action_id, snapshot);
    if (fromBlob) {
      setRecommendCache(key, fromBlob);
      emitMarketplaceProgress(progressKey, { phase: "done" });
      return NextResponse.json({
        matches: fromBlob.matches,
        headline: fromBlob.headline,
        source: fromBlob.source,
        quantity: quantityFromDecision(fromBlob.decision),
        cached: false,
      });
    }
  }

  beginMarketplaceProgress(progressKey);
  emitMarketplaceProgress(progressKey, {
    phase: "queued",
    detail: "Pipeline de recomendaciones",
  });

  try {
    const entry = await runEveRecommendation({
      company_id: body.company_id,
      action_id: body.action_id,
      amount: body.amount,
      snapshot,
      progressKey,
    });
    setRecommendCache(key, entry);
    emitMarketplaceProgress(progressKey, {
      phase: "done",
      detail: entry.headline,
    });
    if (body.amount == null) {
      void writeDecision(`${body.company_id}:${body.action_id}`, {
        decision: entry.decision,
        headline: entry.headline,
      });
    }
    return NextResponse.json({
      matches: entry.matches,
      headline: entry.headline,
      source: entry.source,
      quantity: quantityFromDecision(entry.decision),
      cached: false,
    });
  } catch (err) {
    console.error("[recommend] eve failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    emitMarketplaceProgress(progressKey, {
      phase: "fallback",
      detail,
    });
    if (isTimeoutError(err)) {
      return NextResponse.json(
        {
          error: "Se ha agotado el tiempo de espera del agente",
          detail,
          code: "timeout",
        },
        { status: llmErrorStatus(err) }
      );
    }
    return NextResponse.json(
      {
        error: "No se ha podido generar la recomendación con el agente",
        detail,
        code: "eve_recommend_failed",
      },
      { status: 502 }
    );
  }
}
