import { NextResponse } from "next/server";
import { Client } from "eve/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { FichaActionsDecisionSchema } from "@/agent/lib/schemas";
import {
  getCompanyFacts,
  getDatasetCompany,
  getExportedScore,
} from "@/lib/xray/dataset";
import {
  applyAgentCopy,
  listCompanyActions,
} from "@/lib/xray/recommend-actions";
import { actionsForSnapshot } from "@/lib/xray/registry/actions";
import { resolveLiveSnapshot } from "@/lib/xray/live-snapshot";
import { readImportedPack } from "@/lib/xray/store";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ companyId: string }> };

const cache = new Map<string, ActionRecommendation[]>();
const inflight = new Map<string, Promise<ActionRecommendation[]>>();
const CACHE_VER = "v5";

function eveHost(): string {
  if (process.env.EVE_HOST) return process.env.EVE_HOST;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
}

async function createEveClient(): Promise<Client> {
  const host = eveHost();
  if (process.env.VERCEL) {
    return new Client({
      host,
      auth: { vercelOidc: { token: async () => await getVercelOidcToken() } },
    });
  }
  return new Client({ host });
}

async function resolveFacts(
  companyId: string
): Promise<{
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

async function groundActions(companyId: string, snapshot: ScoreSnapshot) {
  const { facts, exported, currency } = await resolveFacts(companyId);
  return listCompanyActions(
    snapshot,
    facts,
    exported,
    currency,
    actionsForSnapshot
  );
}

async function runEveFicha(
  companyId: string,
  snapshot: ScoreSnapshot,
  facts: CompanyFacts | null,
  currency?: string
): Promise<{ kind: ActionRecommendation["kind"]; title: string }[]> {
  const aging = facts?.invoice_aging;
  const invoices = aging
    ? aging.issued_pending +
      aging.received_pending +
      aging.issued_overdue +
      aging.received_overdue
    : 0;
  const debt = facts
    ? Object.values(facts.debt_by_type).reduce(
        (a, v) => a + Math.abs(v.outstanding),
        0
      )
    : 0;
  const client = await createEveClient();
  const message = [
    `Ficha de ${companyId}. Elige las acciones y ESCRIBE el título de cada una.`,
    JSON.stringify({
      company_id: snapshot.company_id,
      month: snapshot.month,
      score: snapshot.score,
      band: snapshot.band,
      outlook: snapshot.outlook,
      trend: snapshot.trend,
      drivers: snapshot.drivers,
      facts: facts && {
        currency,
        cash_balance: facts.cash_balance,
        monthly_outflow_avg_3m: facts.monthly_outflow_avg_3m,
        has_invoices: invoices > 0,
        has_debt: debt > 0,
      },
    }),
    "Llama a get_recommended_actions. Responde con company_id y actions[{kind,title}].",
    "kind debe existir en el tool. Tú redacts title: una frase corta en español, fiel a ESTE caso.",
    "Si has_invoices es false, no digas circulante. Si has_debt es false, no digas refinanciar.",
    "No copies un título genérico. No inventes importes ni el score.",
    "Máximo 4. Si el tool está vacío, actions: []. No invoques quantity, offering ni match.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const { response } = await client.sessions.create({
      message,
      outputSchema: FichaActionsDecisionSchema,
      signal: controller.signal,
    });
    const result = await response.result();
    const raw =
      result.data &&
      typeof result.data === "object" &&
      !Array.isArray(result.data)
        ? result.data
        : {};
    const parsed = FichaActionsDecisionSchema.parse({
      company_id: companyId,
      actions: [],
      ...raw,
    });
    return parsed.actions;
  } finally {
    clearTimeout(timer);
  }
}

async function compute(companyId: string, snapshot: ScoreSnapshot) {
  const { facts, currency } = await resolveFacts(companyId);
  const ground = await groundActions(companyId, snapshot);
  try {
    const picks = await runEveFicha(companyId, snapshot, facts, currency);
    const merged = applyAgentCopy(ground, picks);
    if (merged.length) return merged;
  } catch (err) {
    console.error("[actions] eve failed, using grounded screens:", err);
  }
  return ground;
}

function resolve(companyId: string, snapshot: ScoreSnapshot) {
  const key = `${CACHE_VER}:${companyId}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = compute(companyId, snapshot)
    .then((actions) => {
      cache.set(key, actions);
      return actions;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  const snapshot = await resolveLiveSnapshot(companyId);
  if (!snapshot) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }
  const actions = await resolve(companyId, snapshot);
  return NextResponse.json(actions, {
    headers: { "Cache-Control": "no-store" },
  });
}
