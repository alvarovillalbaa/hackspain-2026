import { NextResponse, after } from "next/server";
import { Client } from "eve/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { FichaActionsDecisionSchema } from "@/agent/lib/schemas";
import {
  buildScoreSnapshot,
  getCompanyFacts,
  getDatasetCompany,
  getExportedScore,
  hasDataset,
  snapshotFromExported,
} from "@/lib/xray/dataset";
import {
  applyAgentCopy,
  hasPendingCopy,
  listCompanyActions,
} from "@/lib/xray/recommend-actions";
import {
  readImportedPack,
  readStoredActions,
  writeActions,
} from "@/lib/xray/store";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ companyId: string }> };

/** Everything the ficha needs, resolved from Blob/dataset exactly once. */
type CompanyContext = {
  snapshot: ScoreSnapshot;
  facts: CompanyFacts | null;
  exported: ExportedScore | null;
  currency?: string;
};

/** Eve session in flight per company on this instance. */
const inflight = new Set<string>();
/** Last failed enrichment per company, so an outage is not retried per visit. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_FAILURE_MS = 2 * 60_000;
const EVE_TIMEOUT_MS = 45_000;

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

/** Imported pack (re-scored) wins over the committed fact pack. One Blob read. */
async function resolveContext(
  companyId: string
): Promise<CompanyContext | null> {
  const imported = await readImportedPack(companyId);
  if (imported?.score) {
    return {
      snapshot: snapshotFromExported(imported.score),
      facts: imported.facts,
      exported: imported.score,
      currency: imported.company.currency,
    };
  }
  if (!hasDataset()) return null;
  const snapshot = buildScoreSnapshot(companyId);
  if (!snapshot) return null;
  return {
    snapshot,
    facts: getCompanyFacts(companyId),
    exported: getExportedScore(companyId),
    currency: getDatasetCompany(companyId)?.currency,
  };
}

/** Grounded screens only — no TEMPLATES fallback on the live path. */
function groundActions(ctx: CompanyContext): ActionRecommendation[] {
  return listCompanyActions(ctx.snapshot, ctx.facts, ctx.exported, ctx.currency);
}

async function runEveFicha(
  companyId: string,
  ctx: CompanyContext
): Promise<
  {
    action: ActionRecommendation["kind"];
    description: string;
    reasoning: string;
    confidence?: "high" | "medium" | "low";
    amount?: number;
  }[]
> {
  const { snapshot, facts, currency } = ctx;
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
    "No copies un título genérico. Máximo 4. Si el tool está vacío, actions: []. No invoques quantity, offering ni match.",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EVE_TIMEOUT_MS);
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

/**
 * Background enrichment: ask Eve for copy and overlay it on the grounded
 * list. Runs after the response is sent, so the ficha never waits on it.
 * Any Eve answer is persisted with `enriched_at` so the next visit is a
 * cache hit; a thrown error keeps the grounded list and backs off.
 */
async function enrich(
  companyId: string,
  ctx: CompanyContext,
  ground: ActionRecommendation[]
): Promise<void> {
  if (inflight.has(companyId)) return;
  inflight.add(companyId);
  try {
    const picks = await runEveFicha(companyId, ctx);
    const merged = applyAgentCopy(ground, picks);
    await writeActions(companyId, merged, {
      enriched_at: new Date().toISOString(),
    });
    failedAt.delete(companyId);
  } catch (err) {
    failedAt.set(companyId, Date.now());
    console.error("[actions] eve enrichment failed, grounded copy stays:", err);
  } finally {
    inflight.delete(companyId);
  }
}

function shouldEnrich(companyId: string): boolean {
  if (inflight.has(companyId)) return false;
  const last = failedAt.get(companyId);
  return last == null || Date.now() - last > RETRY_AFTER_FAILURE_MS;
}

/**
 * Ficha actions. Responds with the deterministic list at once and lets Eve
 * write copy in the background; `X-Xray-Enrichment` tells the client whether
 * a later fetch may bring richer text (`pending`) or not (`done` / `none`).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { companyId } = await ctx.params;
  const context = await resolveContext(companyId);
  if (!context) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }

  const stored = await readStoredActions(companyId);
  let actions: ActionRecommendation[];
  let enrichment: "pending" | "settled" = "settled";

  if (stored?.enriched_at && stored.actions.length) {
    actions = stored.actions;
  } else {
    // Deterministic actions are cheap: recompute so rule changes show up
    // without an invalidation, then persist so the portfolio view agrees.
    actions = groundActions(context);
    if (actions.length && !stored) await writeActions(companyId, actions);
    if (hasPendingCopy(actions)) {
      if (shouldEnrich(companyId)) {
        const ground = actions;
        after(() => enrich(companyId, context, ground));
        enrichment = "pending";
      } else if (inflight.has(companyId)) {
        enrichment = "pending";
      }
    }
  }

  return NextResponse.json(actions, {
    headers: {
      "Cache-Control": "no-store",
      "X-Xray-Enrichment": enrichment,
    },
  });
}
