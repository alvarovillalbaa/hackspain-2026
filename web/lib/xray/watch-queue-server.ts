import { listDatasetCompanies, hasDataset } from "./dataset";
import { listImportedCompanies } from "./store";
import { scanAllWatchHits } from "@/agent/lib/watch-scan";
import { filterUnsentAlerts, markAlertSent } from "@/agent/lib/alert-log";
import { resolveSlackWebhook } from "./slack-settings";
import { postSlackWebhook } from "./slack-webhook";
import { formatSlackQueue, groupWatchQueue } from "./watch-queue";
import type { SlackSource } from "./slack-status";
import type { WatchQueueItem } from "./types";

async function companyNames(): Promise<Record<string, string>> {
  const imported = await listImportedCompanies();
  const names: Record<string, string> = {};
  for (const c of listDatasetCompanies()) names[c.company_id] = c.name;
  for (const c of imported) names[c.company_id] = c.name;
  return names;
}

export async function loadWatchQueue(): Promise<WatchQueueItem[]> {
  const [alerts, names] = await Promise.all([
    scanAllWatchHits(),
    companyNames(),
  ]);
  return groupWatchQueue(alerts, names);
}

export type WatchFlushResult =
  | {
      ok: true;
      sent: number;
      skipped_dedupe: number;
      source: SlackSource;
    }
  | { ok: false; status: number; error: string };

/** Send unsent watch hits to Slack. No-op if disconnected or nothing new. */
export async function flushWatchToSlack(): Promise<WatchFlushResult> {
  const hook = resolveSlackWebhook();
  if (!hook) {
    return {
      ok: false,
      status: 409,
      error: "Slack no está conectado. Ve a Ajustes.",
    };
  }
  if (!hasDataset()) {
    return { ok: false, status: 503, error: "Fact pack vacío." };
  }

  const alerts = await scanAllWatchHits();
  const unsent = await filterUnsentAlerts(alerts);
  const skipped_dedupe = alerts.length - unsent.length;
  if (unsent.length === 0) {
    return { ok: true, sent: 0, skipped_dedupe, source: hook.source };
  }

  const names = await companyNames();
  const items = groupWatchQueue(unsent, names);
  try {
    await postSlackWebhook(hook.url, formatSlackQueue(items));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 502, error: message };
  }
  for (const a of unsent) {
    await markAlertSent(a, ["slack"]);
  }
  return {
    ok: true,
    sent: items.length,
    skipped_dedupe,
    source: hook.source,
  };
}
