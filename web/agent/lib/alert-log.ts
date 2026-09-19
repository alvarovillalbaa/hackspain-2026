/**
 * Alert delivery log — dedupe (company_id, rule_id, month).
 * In-memory always; optional Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 * Does not touch lib/xray/store.ts (other sessions own that file).
 */
import { list, put } from "@vercel/blob";
import { dedupeKey, type WatchAlert } from "./watch-rules";

const ALERT_PREFIX = "xray/alerts/";

export type AlertChannel = "slack" | "email";

export type AlertLogEntry = {
  key: string;
  alert: WatchAlert;
  channels: AlertChannel[];
  sent_at: string;
};

const memory = new Map<string, AlertLogEntry>();

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function alertPath(key: string): string {
  return `${ALERT_PREFIX}${encodeURIComponent(key)}.json`;
}

export function clearAlertLogForTests(): void {
  memory.clear();
}

export async function wasAlertSent(alert: WatchAlert): Promise<boolean> {
  const key = dedupeKey(alert);
  if (memory.has(key)) return true;
  if (!hasBlob()) return false;

  try {
    const pathname = alertPath(key);
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (!hit?.url) return false;
    const res = await fetch(hit.url);
    if (!res.ok) return false;
    const entry = (await res.json()) as AlertLogEntry;
    memory.set(key, entry);
    return true;
  } catch {
    return false;
  }
}

export async function markAlertSent(
  alert: WatchAlert,
  channels: AlertChannel[]
): Promise<void> {
  const key = dedupeKey(alert);
  const entry: AlertLogEntry = {
    key,
    alert,
    channels,
    sent_at: new Date().toISOString(),
  };
  memory.set(key, entry);
  if (!hasBlob()) return;

  try {
    await put(alertPath(key), JSON.stringify(entry), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      allowOverwrite: true,
    });
  } catch (err) {
    console.warn("[alert-log] blob write failed:", err);
  }
}

export async function filterUnsentAlerts(
  alerts: WatchAlert[]
): Promise<WatchAlert[]> {
  const out: WatchAlert[] = [];
  for (const a of alerts) {
    if (!(await wasAlertSent(a))) out.push(a);
  }
  return out;
}
