import { NextResponse } from "next/server";
import { z } from "zod";
import { Client } from "eve/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { RecommendationDecisionSchema } from "@/agent/lib/schemas";
import { reassembleMatches } from "@/lib/xray/reassemble";
import {
  buildScoreSnapshot,
  hasDataset,
} from "@/lib/xray/dataset";
import { SCORE_BY_ID } from "@/lib/xray/registry/scores";
import {
  actionsForSnapshot,
  resolveAction,
} from "@/lib/xray/registry/actions";
import { mockProvider } from "@/lib/xray/registry/mock-provider";
import { readDecision, writeDecision } from "@/lib/xray/store";
import type { ProductMatch, ScoreSnapshot } from "@/lib/xray/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RequestSchema = z.object({
  company_id: z.string(),
  action_id: z.string(),
  amount: z.number().positive().optional(),
});

type CacheEntry = {
  matches: ProductMatch[];
  headline: string;
  source: "eve" | "warm" | "blob" | "fallback";
};

const memoryCache = new Map<string, CacheEntry>();

function cacheKey(companyId: string, actionId: string, amount?: number) {
  return `${companyId}:${actionId}:${amount ?? "auto"}`;
}

function resolveSnapshot(companyId: string): ScoreSnapshot | null {
  if (hasDataset()) return buildScoreSnapshot(companyId);
  return SCORE_BY_ID[companyId] ?? null;
}

function entryFromDecision(
  companyId: string,
  actionId: string,
  decisionRaw: unknown,
  headline: string | undefined,
  source: CacheEntry["source"]
): CacheEntry | null {
  const snapshot = resolveSnapshot(companyId);
  if (!snapshot) return null;
  const action =
    resolveAction(companyId, actionId, snapshot) ??
    actionsForSnapshot(snapshot)[0];
  if (!action) return null;
  const decision = RecommendationDecisionSchema.parse(decisionRaw);
  return {
    matches: reassembleMatches(decision, snapshot, action),
    headline: headline ?? decision.headline,
    source,
  };
}

async function loadWarm(
  companyId: string,
  actionId: string
): Promise<CacheEntry | null> {
  try {
    const warm = await import("@/lib/xray/dataset/recommendations.json");
    const data = (warm.default ?? warm) as Record<
      string,
      { decision: z.infer<typeof RecommendationDecisionSchema>; headline?: string }
    >;
    const hit = data[`${companyId}:${actionId}`];
    if (!hit) return null;
    return entryFromDecision(
      companyId,
      actionId,
      hit.decision,
      hit.headline,
      "warm"
    );
  } catch {
    return null;
  }
}

async function loadBlob(
  companyId: string,
  actionId: string
): Promise<CacheEntry | null> {
  const stored = await readDecision(`${companyId}:${actionId}`);
  if (!stored?.decision) return null;
  try {
    return entryFromDecision(
      companyId,
      actionId,
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
}): Promise<
  CacheEntry & { decision: z.infer<typeof RecommendationDecisionSchema> }
> {
  const actions = actionsForSnapshot(input.snapshot);
  const action =
    resolveAction(input.company_id, input.action_id, input.snapshot) ??
    actions[0];
  if (!action) {
    throw new Error(`No action for ${input.company_id}/${input.action_id}`);
  }

  const client = await createEveClient();
  const message = [
    "Recommend the best financing product for this company and action.",
    `company_id: ${input.company_id}`,
    `action_id: ${input.action_id}`,
    `action_kind: ${action.kind}`,
    `recommended_amount: ${input.amount ?? action.recommended_amount}`,
    `dimension_deltas: ${JSON.stringify(action.dimension_deltas)}`,
    `band: ${input.snapshot.band}`,
    `score: ${input.snapshot.score}`,
    "Delegate quantity → offering → match. Return structured RecommendationDecision.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);

  try {
    const { response } = await client.sessions.create({
      message,
      outputSchema: RecommendationDecisionSchema,
      signal: controller.signal,
    });

    const result = await response.result();
    const raw = result.data;
    if (!raw) {
      throw new Error("Eve returned no structured data");
    }
    const decision = RecommendationDecisionSchema.parse({
      ...raw,
      company_id: input.company_id,
      action_id: input.action_id,
      action_kind: action.kind,
    });

    if (input.amount != null) {
      decision.quantity.ideal_amount = input.amount;
    }

    return {
      matches: reassembleMatches(decision, input.snapshot, action),
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

  const key = cacheKey(body.company_id, body.action_id, body.amount);
  const cached = memoryCache.get(key);
  if (cached) {
    return NextResponse.json({
      matches: cached.matches,
      headline: cached.headline,
      source: cached.source,
      cached: true,
    });
  }

  // Resolution: memory → Blob → committed seed → live Eve → mock.
  if (body.amount == null) {
    const fromBlob = await loadBlob(body.company_id, body.action_id);
    if (fromBlob) {
      memoryCache.set(key, fromBlob);
      return NextResponse.json({
        matches: fromBlob.matches,
        headline: fromBlob.headline,
        source: fromBlob.source,
        cached: false,
      });
    }

    const warm = await loadWarm(body.company_id, body.action_id);
    if (warm) {
      memoryCache.set(key, warm);
      return NextResponse.json({
        matches: warm.matches,
        headline: warm.headline,
        source: warm.source,
        cached: false,
      });
    }
  }

  const snapshot = resolveSnapshot(body.company_id);
  if (!snapshot) {
    return NextResponse.json(
      { error: `Company not found: ${body.company_id}` },
      { status: 404 }
    );
  }

  try {
    const entry = await runEveRecommendation({
      company_id: body.company_id,
      action_id: body.action_id,
      amount: body.amount,
      snapshot,
    });
    memoryCache.set(key, entry);
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
      cached: false,
    });
  } catch (err) {
    console.error("[recommend] eve failed, falling back:", err);
    const matches = await mockProvider.listProducts(
      body.company_id,
      body.action_id,
      body.amount
    );
    const entry: CacheEntry = {
      matches,
      headline: "Recomendación determinista (fallback)",
      source: "fallback",
    };
    memoryCache.set(key, entry);
    return NextResponse.json({
      matches: entry.matches,
      headline: entry.headline,
      source: entry.source,
      cached: false,
      fallback: true,
      fallback_reason: err instanceof Error ? err.message : String(err),
    });
  }
}
