import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { MARKETPLACE_AGENT_VERSION, runMarketplaceAgent } from "@/agent/lib/marketplace";
import { reassembleMatches } from "@/lib/xray/reassemble";
import { getCompanyFacts, getDatasetCompany, getExportedScore } from "@/lib/xray/dataset";
import { listAllProducts, listEntities } from "@/lib/xray/catalog";
import { findRecommended, listCompanyActions } from "@/lib/xray/recommend-actions";
import { resolveLiveSnapshot } from "@/lib/xray/live-snapshot";
import { readImportedPack, readDecision, writeDecision } from "@/lib/xray/store";
import {
  getRecommendCache,
  quantityFromDecision,
  recommendCacheKey,
  setRecommendCache,
  type RecommendCacheEntry,
} from "@/lib/xray/recommend-cache";
import { beginMarketplaceProgress, emitMarketplaceProgress, marketplaceProgressKey } from "@/lib/xray/marketplace-progress";
import { isTimeoutError, llmErrorStatus } from "@/lib/ai/errors";
import type { ScoreSnapshot } from "@/lib/xray/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  company_id: z.string().min(1).max(200),
  action_id: z.string().min(1).max(200),
  amount: z.number().positive().optional(),
});

const pending = new Map<string, Promise<{ entry: RecommendCacheEntry; cached: boolean }>>();

async function resolveFacts(companyId: string) {
  const imported = await readImportedPack(companyId);
  return imported
    ? { facts: imported.facts, exported: imported.score, company: imported.company }
    : { facts: getCompanyFacts(companyId), exported: getExportedScore(companyId), company: getDatasetCompany(companyId) };
}

function actionsFor(snapshot: ScoreSnapshot, context: Awaited<ReturnType<typeof resolveFacts>>) {
  const { facts, exported, company } = context;
  // Live path: facts-backed only (no TEMPLATES).
  return listCompanyActions(snapshot, facts, exported, company?.currency);
}

/**
 * Only the facts-backed action with this id. Substituting a different action
 * (or a TEMPLATE) would quote a marketplace for something the company was
 * never recommended, so an unknown id is an error, not a fallback.
 */
function actionFor(actionId: string, snapshot: ScoreSnapshot, context: Awaited<ReturnType<typeof resolveFacts>>) {
  return findRecommended(actionsFor(snapshot, context), actionId) ?? null;
}

export async function POST(req: Request) {
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [snapshot, context] = await Promise.all([
    resolveLiveSnapshot(body.company_id),
    resolveFacts(body.company_id),
  ]);
  if (!snapshot || !context.company) {
    return NextResponse.json({ error: `Company not found: ${body.company_id}` }, { status: 404 });
  }
  const action = actionFor(body.action_id, snapshot, context);
  if (!action) {
    return NextResponse.json({ error: `Action not found: ${body.action_id}` }, { status: 404 });
  }
  const { facts, company } = context;
  if (!facts) {
    return NextResponse.json({ error: "No hay hechos financieros para esta empresa" }, { status: 422 });
  }

  const fingerprint = createHash("sha256").update(JSON.stringify({
    version: MARKETPLACE_AGENT_VERSION,
    snapshot,
    facts,
    company,
    action,
    products: listAllProducts(),
    entities: listEntities(),
  })).digest("hex");
  const key = `${recommendCacheKey(body.company_id, body.action_id, body.amount)}:${fingerprint}`;
  const progressKey = marketplaceProgressKey(body.company_id, body.action_id);
  const respond = (entry: RecommendCacheEntry, cached: boolean) => NextResponse.json({
    matches: entry.matches,
    headline: entry.headline,
    source: entry.source,
    quantity: quantityFromDecision(entry.decision),
    cached,
    persisted: entry.persisted ?? false,
  });
  const memory = getRecommendCache(key);
  if (memory) return respond(memory, true);

  const entryFromDecision = (raw: unknown): RecommendCacheEntry => {
    const decision = RecommendationDecisionSchema.parse(raw);
    if (decision.company_id !== company.company_id || decision.action_id !== action.id ||
        decision.action_kind !== action.kind || decision.quantity.company_id !== company.company_id ||
        decision.quantity.action_kind !== action.kind ||
        (body.amount != null && decision.quantity.ideal_amount !== body.amount)) {
      throw new Error("La recomendación no corresponde a la solicitud");
    }
    const matches = reassembleMatches(decision, snapshot, action, "llm", facts);
    if (!matches.length) throw new Error("El agente no seleccionó ofertas válidas");
    return { matches, headline: decision.headline, source: "agent", decision };
  };

  async function loadOrGenerate() {
    const stored = await readDecision(key);
    if (stored?.decision) {
      const parsed = RecommendationDecisionSchema.safeParse(stored.decision);
      if (parsed.success) {
        const entry = { ...entryFromDecision(parsed.data), persisted: true };
        setRecommendCache(key, entry);
        emitMarketplaceProgress(progressKey, { phase: "done", detail: entry.headline });
        return { entry, cached: true };
      }
    }
    beginMarketplaceProgress(progressKey);
    emitMarketplaceProgress(progressKey, { phase: "queued", detail: "Agente de marketplace" });
    const decision = await runMarketplaceAgent({
      snapshot: snapshot!,
      company: company!,
      action: action!,
      facts: facts!,
      amount: body.amount,
      signal: AbortSignal.timeout(240_000),
      onPhase: (phase, detail) => emitMarketplaceProgress(progressKey, { phase, detail }),
    });
    const entry = entryFromDecision(decision);
    entry.persisted = await writeDecision(key, { decision, headline: entry.headline });
    setRecommendCache(key, entry);
    emitMarketplaceProgress(progressKey, { phase: "done", detail: entry.headline });
    return { entry, cached: false };
  }

  try {
    let job = pending.get(key);
    if (!job) {
      job = loadOrGenerate().finally(() => pending.delete(key));
      pending.set(key, job);
    }
    const { entry, cached } = await job;
    return respond(entry, cached);
  } catch (err) {
    console.error("[recommend] agent failed:", err);
    const detail = err instanceof Error ? err.message : String(err);
    emitMarketplaceProgress(progressKey, { phase: "fallback", detail });
    return NextResponse.json({
      error: isTimeoutError(err)
        ? "Se ha agotado el tiempo de espera del agente"
        : "No se ha podido generar la recomendación con el agente",
      code: isTimeoutError(err) ? "timeout" : "agent_recommend_failed",
    }, { status: isTimeoutError(err) ? llmErrorStatus(err) : 502 });
  }
}
