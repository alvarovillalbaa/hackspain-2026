/**
 * Durable store for agent-generated recommendation decisions and imported
 * company packs. Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise
 * falls back to an in-memory Map so local dev still works.
 */
import { put, list, del } from "@vercel/blob";
import type { CompanyRef } from "./types";
import type { CompanyFacts, ExportedScore } from "./dataset/types";

const REC_PREFIX = "xray/recommendations/";
const IMPORT_PREFIX = "xray/imports/";

export type StoredDecision = {
  decision: unknown;
  headline?: string;
  saved_at: string;
};

export type ImportedPack = {
  company: CompanyRef;
  score: ExportedScore;
  facts: CompanyFacts | null;
  saved_at: string;
};

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Process-local fallback when Blob is unavailable (dev / token-less previews). */
const memoryImports = new Map<string, ImportedPack>();

export async function readDecision(
  key: string
): Promise<StoredDecision | null> {
  if (!hasBlob()) return null;
  try {
    const pathname = `${REC_PREFIX}${encodeURIComponent(key)}.json`;
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
    const pathname = `${REC_PREFIX}${encodeURIComponent(key)}.json`;
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

export async function writeImportedPack(
  pack: Omit<ImportedPack, "saved_at">
): Promise<boolean> {
  const body: ImportedPack = {
    ...pack,
    company: { ...pack.company, imported: true },
    saved_at: new Date().toISOString(),
  };
  const id = pack.company.company_id;
  memoryImports.set(id, body);

  if (!hasBlob()) return true;
  try {
    const pathname = `${IMPORT_PREFIX}${encodeURIComponent(id)}.json`;
    await put(pathname, JSON.stringify(body), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      allowOverwrite: true,
    });
    return true;
  } catch (err) {
    console.warn("[blob] writeImportedPack failed:", err);
    return true; // memory still has it
  }
}

export async function readImportedPack(
  companyId: string
): Promise<ImportedPack | null> {
  const mem = memoryImports.get(companyId);
  if (mem) return mem;

  if (!hasBlob()) return null;
  try {
    const pathname = `${IMPORT_PREFIX}${encodeURIComponent(companyId)}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (!hit?.url) return null;
    const res = await fetch(hit.url);
    if (!res.ok) return null;
    const pack = (await res.json()) as ImportedPack;
    memoryImports.set(companyId, pack);
    return pack;
  } catch (err) {
    console.warn("[blob] readImportedPack failed:", err);
    return null;
  }
}

export async function listImportedPacks(): Promise<ImportedPack[]> {
  await listImportedCompanies();
  return [...memoryImports.values()];
}

export async function listImportedCompanies(): Promise<CompanyRef[]> {
  const fromMem = [...memoryImports.values()].map((p) => p.company);

  if (!hasBlob()) return fromMem;

  try {
    const { blobs } = await list({ prefix: IMPORT_PREFIX, limit: 500 });
    const ids = new Set(fromMem.map((c) => c.company_id));
    const extra: CompanyRef[] = [];
    for (const b of blobs) {
      if (!b.pathname.endsWith(".json")) continue;
      const res = await fetch(b.url);
      if (!res.ok) continue;
      const pack = (await res.json()) as ImportedPack;
      memoryImports.set(pack.company.company_id, pack);
      if (!ids.has(pack.company.company_id)) {
        extra.push(pack.company);
        ids.add(pack.company.company_id);
      }
    }
    return [...fromMem, ...extra];
  } catch (err) {
    console.warn("[blob] listImportedCompanies failed:", err);
    return fromMem;
  }
}

export async function deleteDecisionsForCompany(
  companyId: string
): Promise<number> {
  if (!hasBlob()) return 0;
  try {
    const { blobs } = await list({
      prefix: `${REC_PREFIX}${companyId}`,
      limit: 200,
    });
    if (blobs.length === 0) return 0;
    await del(blobs.map((b) => b.url));
    return blobs.length;
  } catch (err) {
    console.warn("[blob] deleteDecisionsForCompany failed:", err);
    return 0;
  }
}
