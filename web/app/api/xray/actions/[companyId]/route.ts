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
import { resolveLiveSnapshot } from "@/lib/xray/live-snapshot";
import {
  readActions,
  readImportedPack,
  writeActions,
} from "@/lib/xray/store";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";
import { isTimeoutError, llmErrorStatus } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ companyId: string }> };

const inflight = new Map<string, Promise<ActionRecommendation[]>>();

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

/** Grounded screens only — no TEMPLATES fallback on the live path. */
async function groundActions(companyId: string, snapshot: ScoreSnapshot) {
  const { facts, exported, currency } = await resolveFacts(companyId);
  return listCompanyActions(snapshot, facts, exported, currency);
}

type FichaActionPick = {
  action: ActionRecommendation["kind"];
  description: string;
  reasoning: string;
  confidence?: "high" | "medium" | "low";
  amount?: number;
};

async function runEveFicha(
  companyId: string,
  snapshot: ScoreSnapshot,
  facts: CompanyFacts | null,
  currency?: string
): Promise<FichaActionPick[]> {
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
  const brief = [
    `Ficha de ${companyId}. Elige las acciones y ESCRIBE description + reasoning de cada una.`,
    JSON.stringify({
      company_id: snapshot.company_id,
      month: snapshot.month,
      score: snapshot.score,
      outlook: snapshot.outlook,
      trend: snapshot.trend,
      confidence: snapshot.confidence,
      drivers: snapshot.drivers,
      facts: facts && {
        currency,
        cash_balance: facts.cash_balance,
        monthly_outflow_avg_3m: facts.monthly_outflow_avg_3m,
        has_invoices: invoices > 0,
        has_debt: debt > 0,
      },
    }),
    "Llama a get_recommended_actions. Responde con company_id y actions[{action,description,reasoning,confidence?}].",
    "action (=kind) debe existir en el tool. Tú redactas description (frase corta) y reasoning (tooltip: por qué esta acción para ESTA empresa).",
    "No inventes importes ni el score. Cita señales/hechos del JSON o del tool.",
    "Si has_invoices es false, no digas circulante. Si has_debt es false, no digas refinanciar.",
    "No copies un título genérico. Máximo 4. Si el tool está vacío, actions: []. No invoques financing_finale ni quantity/offering/match.",
  ].join("\n");

  const message = [
    "Call `actions_recommender` exactly once. Pass it this brief unchanged.",
    "Do not call get_recommended_actions yourself — actions_recommender owns that tool.",
    "---",
    brief,
    "---",
    "Reply with one short line after dispatching.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  const signal = controller.signal;

  try {
    let childId: string | null = null;
    let actions: FichaActionPick[] | null = null;

    const absorb = (event: {
      type: string;
      data?: Record<string, unknown>;
    }) => {
      if (event.type === "subagent.called") {
        const name = String(event.data?.name ?? event.data?.toolName ?? "");
        const id = event.data?.childSessionId;
        if (name === "actions_recommender" && typeof id === "string") {
          childId = id;
        }
      }
      const tryParse = (raw: unknown) => {
        const candidate =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? raw
            : typeof raw === "string"
              ? (() => {
                  try {
                    return JSON.parse(raw) as object;
                  } catch {
                    return null;
                  }
                })()
              : null;
        if (!candidate) return;
        const ok = FichaActionsDecisionSchema.safeParse({
          company_id: companyId,
          actions: [],
          ...candidate,
        });
        if (ok.success) actions = ok.data.actions;
      };
      if (event.type === "result.completed") {
        tryParse(event.data?.result);
      }
      if (event.type === "subagent.completed") {
        const name = String(
          event.data?.subagentName ?? event.data?.name ?? ""
        );
        if (name === "actions_recommender") {
          tryParse(event.data?.output);
        }
      }
    };

    const { session, response } = await client.sessions.create({
      message,
      signal,
    });
    for await (const event of response) {
      absorb(event as { type: string; data?: Record<string, unknown> });
      if (actions) return actions;
    }

    if (!childId) {
      for await (const event of session.stream({ signal })) {
        absorb(event as { type: string; data?: Record<string, unknown> });
        if (actions) return actions;
        if (childId) break;
      }
    }
    if (!childId) {
      throw new Error("actions_recommender was not dispatched");
    }

    for await (const event of client.sessions.attach(childId).stream({ signal })) {
      absorb(event as { type: string; data?: Record<string, unknown> });
      if (actions) return actions;
      if (event.type === "session.waiting") break;
    }

    if (actions) return actions;
    throw new Error("actions_recommender finished without a structured payload");
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
    const out = merged.length ? merged : ground;
    if (out.length) await writeActions(companyId, out);
    return out;
  } catch (err) {
    console.error("[actions] eve failed:", err);
    throw err;
  }
}

async function resolve(companyId: string, snapshot: ScoreSnapshot) {
  const cached = await readActions(companyId);
  if (cached?.length) return cached;

  const pending = inflight.get(companyId);
  if (pending) return pending;
  const p = compute(companyId, snapshot).finally(() =>
    inflight.delete(companyId)
  );
  inflight.set(companyId, p);
  return p;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  const snapshot = await resolveLiveSnapshot(companyId);
  if (!snapshot) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }
  try {
    const actions = await resolve(companyId, snapshot);
    return NextResponse.json(actions, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
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
        error: "No se han podido redactar las acciones con el agente",
        detail,
        code: "eve_actions_failed",
      },
      { status: 502 }
    );
  }
}
