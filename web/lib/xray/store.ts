/**
 * Durable JSON store for the live demo (no Postgres).
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set; otherwise falls back
 * to process-local Maps so local dev still works.
 *
 * Prefixes:
 *   xray/session.json
 *   xray/imports/{id}.json
 *   xray/recommendations/{company:action}.json
 *   xray/actions/{id}.json
 *   xray/deals/{id}.json
 */
import { put, list, del } from "@vercel/blob";
import { DEFAULT_GROUP_ID } from "./demo";
import type { AcceptedDeal, ActionRecommendation, CompanyRef } from "./types";
import type { CompanyFacts, ExportedScore } from "./dataset/types";

const REC_PREFIX = "xray/recommendations/";
const IMPORT_PREFIX = "xray/imports/";
const DEAL_PREFIX = "xray/deals/";
const ACTIONS_PREFIX = "xray/actions/";
const SESSION_PATH = "xray/session.json";

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

export type DemoSession = {
  group_id: string;
  updated_at: string;
};

export type StoredActions = {
  actions: ActionRecommendation[];
  saved_at: string;
};

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Process-local fallback when Blob is unavailable (dev / token-less previews). */
const memoryImports = new Map<string, ImportedPack>();
const memoryDeals = new Map<string, AcceptedDeal>();
const memoryActions = new Map<string, StoredActions>();
const memoryDecisions = new Map<string, StoredDecision>();
let memorySession: DemoSession | null = null;

async function blobGetJson<T>(pathname: string): Promise<T | null> {
  if (!hasBlob()) return null;
  try {
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (!hit?.url) return null;
    const res = await fetch(hit.url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[blob] get ${pathname} failed:`, err);
    return null;
  }
}

async function blobPutJson(pathname: string, body: unknown): Promise<boolean> {
  if (!hasBlob()) return false;
  try {
    await put(pathname, JSON.stringify(body), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
      allowOverwrite: true,
    });
    return true;
  } catch (err) {
    console.warn(`[blob] put ${pathname} failed:`, err);
    return false;
  }
}

async function blobDeletePrefix(prefix: string): Promise<number> {
  if (!hasBlob()) return 0;
  try {
    const { blobs } = await list({ prefix, limit: 200 });
    if (blobs.length === 0) return 0;
    await del(blobs.map((b) => b.url));
    return blobs.length;
  } catch (err) {
    console.warn(`[blob] delete ${prefix} failed:`, err);
    return 0;
  }
}

/** Reset memory maps — tests only. */
export function clearStoreMemoryForTests(): void {
  memoryImports.clear();
  memoryDeals.clear();
  memoryActions.clear();
  memoryDecisions.clear();
  memorySession = null;
}

// --- session ---

export async function readSession(): Promise<DemoSession> {
  if (memorySession) return memorySession;
  const fromBlob = await blobGetJson<DemoSession>(SESSION_PATH);
  if (fromBlob?.group_id) {
    memorySession = fromBlob;
    return fromBlob;
  }
  return {
    group_id: DEFAULT_GROUP_ID,
    updated_at: new Date(0).toISOString(),
  };
}

export async function writeSession(groupId: string): Promise<DemoSession> {
  const body: DemoSession = {
    group_id: groupId,
    updated_at: new Date().toISOString(),
  };
  memorySession = body;
  await blobPutJson(SESSION_PATH, body);
  return body;
}

// --- recommendations ---

export async function readDecision(
  key: string
): Promise<StoredDecision | null> {
  const mem = memoryDecisions.get(key);
  if (mem) return mem;
  if (!hasBlob()) return null;
  try {
    const pathname = `${REC_PREFIX}${encodeURIComponent(key)}.json`;
    const hit = await blobGetJson<StoredDecision>(pathname);
    if (hit) memoryDecisions.set(key, hit);
    return hit;
  } catch (err) {
    console.warn("[blob] readDecision failed:", err);
    return null;
  }
}

export async function writeDecision(
  key: string,
  value: { decision: unknown; headline?: string }
): Promise<boolean> {
  const body: StoredDecision = {
    ...value,
    saved_at: new Date().toISOString(),
  };
  memoryDecisions.set(key, body);
  if (!hasBlob()) return true;
  try {
    const pathname = `${REC_PREFIX}${encodeURIComponent(key)}.json`;
    return await blobPutJson(pathname, body);
  } catch (err) {
    console.warn("[blob] writeDecision failed:", err);
    return true;
  }
}

export async function deleteDecisionsForCompany(
  companyId: string
): Promise<number> {
  for (const key of [...memoryDecisions.keys()]) {
    if (key.startsWith(`${companyId}:`)) memoryDecisions.delete(key);
  }
  return blobDeletePrefix(`${REC_PREFIX}${companyId}`);
}

// --- imports ---

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
    await blobPutJson(pathname, body);
    return true;
  } catch (err) {
    console.warn("[blob] writeImportedPack failed:", err);
    return true;
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
    const pack = await blobGetJson<ImportedPack>(pathname);
    if (pack) memoryImports.set(companyId, pack);
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

// --- deals ---

export async function readDeal(
  companyId: string
): Promise<AcceptedDeal | null> {
  const mem = memoryDeals.get(companyId);
  if (mem) return mem;
  if (!hasBlob()) return null;
  const pathname = `${DEAL_PREFIX}${encodeURIComponent(companyId)}.json`;
  const deal = await blobGetJson<AcceptedDeal>(pathname);
  if (deal) memoryDeals.set(companyId, deal);
  return deal;
}

export async function writeDeal(deal: AcceptedDeal): Promise<boolean> {
  memoryDeals.set(deal.company_id, deal);
  if (!hasBlob()) return true;
  const pathname = `${DEAL_PREFIX}${encodeURIComponent(deal.company_id)}.json`;
  return blobPutJson(pathname, deal);
}

export async function deleteDeal(companyId: string): Promise<boolean> {
  memoryDeals.delete(companyId);
  if (!hasBlob()) return true;
  try {
    const pathname = `${DEAL_PREFIX}${encodeURIComponent(companyId)}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (hit?.url) await del(hit.url);
    return true;
  } catch (err) {
    console.warn("[blob] deleteDeal failed:", err);
    return false;
  }
}

export async function deleteDealsForCompanies(
  companyIds: string[]
): Promise<number> {
  let n = 0;
  for (const id of companyIds) {
    if (await deleteDeal(id)) n += 1;
  }
  return n;
}

/** Wipe deals for every company in a group (rehearsal control on /start). */
export async function deleteDealsForGroup(
  companyIds: string[]
): Promise<number> {
  return deleteDealsForCompanies(companyIds);
}

// --- Eve ficha actions ---

export async function readActions(
  companyId: string
): Promise<ActionRecommendation[] | null> {
  const mem = memoryActions.get(companyId);
  if (mem) return mem.actions;
  if (!hasBlob()) return null;
  const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
  const stored = await blobGetJson<StoredActions>(pathname);
  if (stored?.actions) {
    memoryActions.set(companyId, stored);
    return stored.actions;
  }
  return null;
}

export async function writeActions(
  companyId: string,
  actions: ActionRecommendation[]
): Promise<boolean> {
  const body: StoredActions = {
    actions,
    saved_at: new Date().toISOString(),
  };
  memoryActions.set(companyId, body);
  if (!hasBlob()) return true;
  const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
  return blobPutJson(pathname, body);
}

export async function invalidateActions(companyId: string): Promise<boolean> {
  memoryActions.delete(companyId);
  if (!hasBlob()) return true;
  try {
    const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
    if (hit?.url) await del(hit.url);
    return true;
  } catch (err) {
    console.warn("[blob] invalidateActions failed:", err);
    return false;
  }
}

export async function invalidateActionsForCompanies(
  companyIds: string[]
): Promise<number> {
  let n = 0;
  for (const id of companyIds) {
    if (await invalidateActions(id)) n += 1;
  }
  return n;
}
