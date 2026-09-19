/**
 * After an import, tell the watcher about the new Health Score.
 * Prefers the Eve watcher subagent (parent Mode C). Falls back to
 * evaluateWatch + POST /internal/watch so Slack/email still fire if Eve is down.
 */
import { Client } from "eve/client";
import { getVercelOidcToken } from "@vercel/oidc";
import { evaluateWatch, type WatchAlert } from "@/agent/lib/watch-rules";
import { watchDispatchUrl } from "@/agent/lib/watch-dispatch";
import type { ExportedScore } from "@/lib/xray/dataset/types";
import { snapshotFromExported } from "@/lib/xray/snapshot";

export type WatchTriggerResult = {
  alerts: WatchAlert[];
  triggered: boolean;
  via: "eve" | "dispatch" | "none";
  error?: string;
};

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
      auth: {
        vercelOidc: {
          token: async () => await getVercelOidcToken(),
        },
      },
    });
  }
  return new Client({ host });
}

function alertsForScores(scores: ExportedScore[]): WatchAlert[] {
  const out: WatchAlert[] = [];
  for (const row of scores) {
    const snapshot = snapshotFromExported(row);
    out.push(
      ...evaluateWatch(snapshot, { dscr_6m: row.signals.dscr_6m ?? null })
    );
  }
  return out;
}

async function invokeWatcherAgent(companyIds: string[]): Promise<void> {
  const client = await createEveClient();
  const ids = companyIds.join(", ");
  const message = [
    `Vigila ${ids} tras una importación de tesorería.`,
    "Delega al subagente watcher.",
    "Llama evaluate_watch y, si hay alertas, submit_alerts (slack+email).",
    "No recalcules el score. No invoques quantity, offering ni match.",
  ].join(" ");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const { response } = await client.sessions.create({
      message,
      signal: controller.signal,
    });
    await response.result();
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchAlerts(alerts: WatchAlert[]): Promise<boolean> {
  const secret = process.env.WATCH_DISPATCH_SECRET;
  if (!secret || alerts.length === 0) return false;
  const res = await fetch(watchDispatchUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      alerts,
      notify: ["slack", "email"],
      copy: `Importación de tesorería — ${alerts.length} alerta(s).`,
    }),
  });
  return res.ok;
}

/** Fire-and-forget from the import route (`after()`). */
export async function triggerWatcherAfterImport(
  scores: ExportedScore[]
): Promise<WatchTriggerResult> {
  const companyIds = [...new Set(scores.map((s) => s.company_id))];
  const alerts = alertsForScores(scores);
  if (companyIds.length === 0) {
    return { alerts: [], triggered: false, via: "none" };
  }

  try {
    await invokeWatcherAgent(companyIds);
    return { alerts, triggered: true, via: "eve" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (alerts.length === 0) {
      return { alerts, triggered: false, via: "none", error: msg };
    }
    try {
      const ok = await dispatchAlerts(alerts);
      return {
        alerts,
        triggered: ok,
        via: ok ? "dispatch" : "none",
        error: ok ? undefined : msg,
      };
    } catch (dispatchErr) {
      const d =
        dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
      return { alerts, triggered: false, via: "none", error: `${msg}; ${d}` };
    }
  }
}
