/**
 * Durable store for agent-generated recommendation decisions.
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise no-ops
 * so local dev and token-less previews still work off the committed seed.
 */
import { put, list } from "@vercel/blob";

const PREFIX = "xray/recommendations/";

export type StoredDecision = {
  decision: unknown;
  headline?: string;
  saved_at: string;
};

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readDecision(
  key: string
): Promise<StoredDecision | null> {
  if (!hasBlob()) return null;
  try {
    const pathname = `${PREFIX}${encodeURIComponent(key)}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (!hit?.url) return null;
    const res = await fetch(hit.url);
    if (!res.ok) return null;
    return (await res.json()) as StoredDecision;
  } catch (err) {
    console.warn("[blob] readDecision failed:", err);
    return null;
  }
}

export async function writeDecision(
  key: string,
  value: { decision: unknown; headline?: string }
): Promise<boolean> {
  if (!hasBlob()) return false;
  try {
    const pathname = `${PREFIX}${encodeURIComponent(key)}.json`;
    const body: StoredDecision = {
      ...value,
      saved_at: new Date().toISOString(),
    };
    await put(pathname, JSON.stringify(body), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      allowOverwrite: true,
    });
    return true;
  } catch (err) {
    console.warn("[blob] writeDecision failed:", err);
    return false;
  }
}
