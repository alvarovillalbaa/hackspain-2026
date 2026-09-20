/**
 * Durable JSON store for the live demo (no Postgres, no database).
 *
 * Three tiers, in order:
 *   1. Vercel Blob, when BLOB_READ_WRITE_TOKEN is set — the only tier that
 *      survives on Vercel, whose filesystem is read-only outside /tmp.
 *   2. JSON files inside the repo (`web/data/runtime/`, override with
 *      XRAY_RUNTIME_DIR) — what everything the platform generates locally
 *      lands in, so it survives restarts and can be committed or reset with
 *      `git checkout`.
 *   3. Process-local Maps, the last resort (a Vercel deploy with no Blob
 *      token): the demo still runs, but nothing outlives a cold start.
 *
 * Prefixes:
 *   xray/session.json  (focus group for /start; not a table filter)
 *   xray/imports/{id}.json
 *   xray/import-csvs/{id}.json  (canonical tables for Python re-ingest)
 *   xray/recommendations/{company:action}.json
 *   xray/actions/{id}.json
 *   xray/deals/{id}.json
 *   xray/explanations/{key}.json
 */
import { put, list, del } from "@vercel/blob";
import { DEFAULT_GROUP_ID } from "./demo";
import type { StoredImportSource } from "./import-source";
import type { AcceptedDeal, ActionRecommendation, CompanyRef } from "./types";
import type { CompanyFacts, ExportedScore } from "./dataset/types";

const REC_PREFIX = "xray/recommendations/";
const IMPORT_PREFIX = "xray/imports/";
const SOURCE_PREFIX = "xray/import-csvs/";
const DEAL_PREFIX = "xray/deals/";
const ACTIONS_PREFIX = "xray/actions/";
const EXPLAIN_PREFIX = "xray/explanations/";
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
  /**
   * Set once Eve has been asked for copy (even if it returned nothing usable),
   * so the ficha route does not retry enrichment on every visit.
   */
  enriched_at?: string;
};

export type StoredExplanation = {
  plain: string;
  technical: string;
  saved_at: string;
};

function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Vercel bundles the app into a read-only filesystem, so the in-repo tier is
 * for local runs only. One failed write disables it for the rest of the
 * process instead of logging on every request.
 */
let fsDisabled = process.env.VERCEL ? true : false;

function hasFs(): boolean {
  return !fsDisabled;
}

/** Durable at all, or memory-only? */
function hasDurable(): boolean {
  return hasBlob() || hasFs();
}

/** `xray/imports/COMP_0058.json` → `<runtime dir>/imports/COMP_0058.json` */
async function fsPathFor(pathname: string): Promise<string> {
  const { join, resolve } = await import("node:path");
  const root =
    process.env.XRAY_RUNTIME_DIR ??
    join(process.cwd(), "data", "runtime");
  return resolve(root, pathname.replace(/^xray\//, ""));
}

async function fsGetJson<T>(pathname: string): Promise<T | null> {
  if (!hasFs()) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(await fsPathFor(pathname), "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") console.warn(`[fs] get ${pathname} failed:`, err);
    return null;
  }
}

async function fsPutJson(pathname: string, body: unknown): Promise<boolean> {
  if (!hasFs()) return false;
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const file = await fsPathFor(pathname);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return true;
  } catch (err) {
    fsDisabled = true;
    console.warn(`[fs] put ${pathname} failed, memory only from now on:`, err);
    return false;
  }
}

async function fsDeletePath(pathname: string): Promise<boolean> {
  if (!hasFs()) return false;
  try {
    const { rm } = await import("node:fs/promises");
    await rm(await fsPathFor(pathname), { force: true });
    return true;
  } catch (err) {
    console.warn(`[fs] delete ${pathname} failed:`, err);
    return false;
  }
}

/** Pathnames under a prefix, e.g. every imported pack. */
async function fsListPrefix(prefix: string): Promise<string[]> {
  if (!hasFs()) return [];
  try {
    const { readdir } = await import("node:fs/promises");
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const names = await readdir(await fsPathFor(dir));
    return names
      .filter((n) => n.endsWith(".json"))
      .map((n) => `${dir}${n}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ENOENT") console.warn(`[fs] list ${prefix} failed:`, err);
    return [];
  }
}

/** Process-local fallback when neither Blob nor the repo are writable. */
const memoryImports = new Map<string, ImportedPack>();
const memoryImportSources = new Map<string, StoredImportSource>();
const memoryDeals = new Map<string, AcceptedDeal>();
const memoryActions = new Map<string, StoredActions>();
const memoryDecisions = new Map<string, StoredDecision>();
const memoryExplanations = new Map<string, StoredExplanation>();
let memorySession: DemoSession | null = null;

/**
 * Paths known to be absent, with the time the miss expires. Without this a
 * portfolio-wide read pays one Blob `list()` per company on every request,
 * because only hits are memoized.
 */
const missingUntil = new Map<string, number>();
const MISS_TTL_MS = 60_000;

function isKnownMissing(pathname: string): boolean {
  const until = missingUntil.get(pathname);
  if (until == null) return false;
  if (Date.now() < until) return true;
  missingUntil.delete(pathname);
  return false;
}

function rememberMiss(pathname: string): void {
  missingUntil.set(pathname, Date.now() + MISS_TTL_MS);
}

/**
 * Bumped on every write or invalidation of imports and actions, so routes
 * that assemble a portfolio-wide view can memoize until something changed.
 */
let storeVersion = 0;

export function getStoreVersion(): number {
  return storeVersion;
}

function touch(pathname?: string): void {
  storeVersion += 1;
  if (pathname) missingUntil.delete(pathname);
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function blobGetJson<T>(pathname: string): Promise<T | null> {
  if (hasBlob()) {
    try {
      const { blobs } = await list({ prefix: pathname, limit: 1 });
      const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
      if (hit?.url) {
        const res = await fetch(hit.url);
        if (res.ok) return (await res.json()) as T;
      }
    } catch (err) {
      console.warn(`[blob] get ${pathname} failed:`, err);
    }
  }
  return fsGetJson<T>(pathname);
}

async function blobPutJson(pathname: string, body: unknown): Promise<boolean> {
  if (hasBlob()) {
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
    }
  }
  return fsPutJson(pathname, body);
}

async function blobDeletePath(pathname: string): Promise<boolean> {
  if (hasBlob()) {
    try {
      const { blobs } = await list({ prefix: pathname, limit: 1 });
      const hit = blobs.find((b) => b.pathname === pathname) ?? blobs[0];
      if (hit?.url) await del(hit.url);
    } catch (err) {
      console.warn(`[blob] delete ${pathname} failed:`, err);
      return false;
    }
  }
  await fsDeletePath(pathname);
  return true;
}

async function blobDeletePrefix(prefix: string): Promise<number> {
  let n = 0;
  if (hasBlob()) {
    try {
      const { blobs } = await list({ prefix, limit: 200 });
      if (blobs.length > 0) {
        await del(blobs.map((b) => b.url));
        n += blobs.length;
      }
    } catch (err) {
      console.warn(`[blob] delete ${prefix} failed:`, err);
    }
  }
  // Prefix may be a directory (`xray/imports/`) or an id prefix
  // (`xray/recommendations/COMP_1`); readdir only handles the former.
  const slash = prefix.lastIndexOf("/");
  const dir = prefix.slice(0, slash + 1);
  const startsWith = prefix.slice(slash + 1);
  for (const path of await fsListPrefix(dir)) {
    if (startsWith && !path.slice(dir.length).startsWith(startsWith)) continue;
    if (await fsDeletePath(path)) n += 1;
  }
  return n;
}

/** Pathnames stored under a prefix, across whichever tier is active. */
async function listStoredPaths(prefix: string): Promise<string[]> {
  const paths = new Set<string>();
  if (hasBlob()) {
    try {
      const { blobs } = await list({ prefix, limit: 500 });
      for (const b of blobs) {
        if (b.pathname.endsWith(".json")) paths.add(b.pathname);
      }
    } catch (err) {
      console.warn(`[blob] list ${prefix} failed:`, err);
    }
  }
  for (const p of await fsListPrefix(prefix)) paths.add(p);
  return [...paths];
}

/** Reset memory maps — tests only. */
export function clearStoreMemoryForTests(): void {
  memoryImports.clear();
  memoryImportSources.clear();
  memoryDeals.clear();
  memoryActions.clear();
  memoryDecisions.clear();
  memoryExplanations.clear();
  memorySession = null;
  missingUntil.clear();
  storeVersion = 0;
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
  if (!hasDurable()) return null;
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
  if (!hasDurable()) return true;
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
  const pathname = `${IMPORT_PREFIX}${encodeURIComponent(id)}.json`;
  touch(pathname);

  if (!hasDurable()) return true;
  try {
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

  if (!hasDurable()) return null;
  const pathname = `${IMPORT_PREFIX}${encodeURIComponent(companyId)}.json`;
  if (isKnownMissing(pathname)) return null;
  try {
    const pack = await blobGetJson<ImportedPack>(pathname);
    if (pack) memoryImports.set(companyId, pack);
    else rememberMiss(pathname);
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

  if (!hasDurable()) return fromMem;

  try {
    const ids = new Set(fromMem.map((c) => c.company_id));
    const extra: CompanyRef[] = [];
    for (const pathname of await listStoredPaths(IMPORT_PREFIX)) {
      const pack = await blobGetJson<ImportedPack>(pathname);
      if (!pack?.company) continue;
      memoryImports.set(pack.company.company_id, pack);
      if (!ids.has(pack.company.company_id)) {
        extra.push(pack.company);
        ids.add(pack.company.company_id);
      }
    }
    return [...fromMem, ...extra];
  } catch (err) {
    console.warn("[store] listImportedCompanies failed:", err);
    return fromMem;
  }
}

// --- import CSVs (Python re-ingest source; not listed with packs) ---

export async function writeImportSource(
  companyId: string,
  tables: StoredImportSource["tables"]
): Promise<boolean> {
  const body: StoredImportSource = {
    tables,
    saved_at: new Date().toISOString(),
  };
  memoryImportSources.set(companyId, body);
  if (!hasDurable()) return true;
  try {
    const pathname = `${SOURCE_PREFIX}${encodeURIComponent(companyId)}.json`;
    await blobPutJson(pathname, body);
    return true;
  } catch (err) {
    console.warn("[blob] writeImportSource failed:", err);
    return true;
  }
}

export async function readImportSource(
  companyId: string
): Promise<StoredImportSource | null> {
  const mem = memoryImportSources.get(companyId);
  if (mem) return mem;
  if (!hasDurable()) return null;
  try {
    const pathname = `${SOURCE_PREFIX}${encodeURIComponent(companyId)}.json`;
    const hit = await blobGetJson<StoredImportSource>(pathname);
    if (hit?.tables) memoryImportSources.set(companyId, hit);
    return hit;
  } catch (err) {
    console.warn("[blob] readImportSource failed:", err);
    return null;
  }
}

// --- deals ---

export async function readDeal(
  companyId: string
): Promise<AcceptedDeal | null> {
  const mem = memoryDeals.get(companyId);
  if (mem) return mem;
  if (!hasDurable()) return null;
  const pathname = `${DEAL_PREFIX}${encodeURIComponent(companyId)}.json`;
  const deal = await blobGetJson<AcceptedDeal>(pathname);
  if (deal) memoryDeals.set(companyId, deal);
  return deal;
}

/** All accepted deals (memory + durable). Used by Productos book. */
export async function listDeals(): Promise<AcceptedDeal[]> {
  const byId = new Map<string, AcceptedDeal>();
  for (const deal of memoryDeals.values()) {
    byId.set(deal.company_id, deal);
  }
  if (!hasDurable()) return [...byId.values()];

  try {
    for (const pathname of await listStoredPaths(DEAL_PREFIX)) {
      const deal = await blobGetJson<AcceptedDeal>(pathname);
      if (!deal?.company_id) continue;
      memoryDeals.set(deal.company_id, deal);
      byId.set(deal.company_id, deal);
    }
  } catch (err) {
    console.warn("[store] listDeals failed:", err);
  }
  return [...byId.values()];
}

export async function writeDeal(deal: AcceptedDeal): Promise<boolean> {
  memoryDeals.set(deal.company_id, deal);
  if (!hasDurable()) return true;
  const pathname = `${DEAL_PREFIX}${encodeURIComponent(deal.company_id)}.json`;
  return blobPutJson(pathname, deal);
}

export async function deleteDeal(companyId: string): Promise<boolean> {
  memoryDeals.delete(companyId);
  if (!hasDurable()) return true;
  return blobDeletePath(`${DEAL_PREFIX}${encodeURIComponent(companyId)}.json`);
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

export async function readStoredActions(
  companyId: string
): Promise<StoredActions | null> {
  const mem = memoryActions.get(companyId);
  if (mem) return mem;
  if (!hasDurable()) return null;
  const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
  if (isKnownMissing(pathname)) return null;
  const stored = await blobGetJson<StoredActions>(pathname);
  if (stored?.actions) {
    memoryActions.set(companyId, stored);
    return stored;
  }
  rememberMiss(pathname);
  return null;
}

/** `xray/actions/COMP%201.json` → `COMP 1` */
function companyIdFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix) || !pathname.endsWith(".json")) return null;
  try {
    return decodeURIComponent(pathname.slice(prefix.length, -".json".length));
  } catch {
    return null;
  }
}

/**
 * Every company's stored actions in one prefix listing plus parallel reads
 * of the files not yet in memory. This is what a portfolio-wide view should
 * call instead of `readStoredActions` per company.
 */
export async function listStoredActions(): Promise<Map<string, StoredActions>> {
  if (hasDurable()) {
    const pending: { companyId: string; pathname: string }[] = [];
    for (const pathname of await listStoredPaths(ACTIONS_PREFIX)) {
      const companyId = companyIdFromPath(pathname, ACTIONS_PREFIX);
      if (companyId && !memoryActions.has(companyId)) {
        pending.push({ companyId, pathname });
      }
    }
    await mapLimit(pending, 16, async ({ companyId, pathname }) => {
      const stored = await blobGetJson<StoredActions>(pathname);
      if (stored?.actions) memoryActions.set(companyId, stored);
    });
  }
  return new Map(memoryActions);
}

export async function readActions(
  companyId: string
): Promise<ActionRecommendation[] | null> {
  return (await readStoredActions(companyId))?.actions ?? null;
}

export async function writeActions(
  companyId: string,
  actions: ActionRecommendation[],
  opts: { enriched_at?: string } = {}
): Promise<boolean> {
  const body: StoredActions = {
    actions,
    saved_at: new Date().toISOString(),
    ...(opts.enriched_at ? { enriched_at: opts.enriched_at } : {}),
  };
  memoryActions.set(companyId, body);
  const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
  touch(pathname);
  if (!hasDurable()) return true;
  return blobPutJson(pathname, body);
}

export async function invalidateActions(companyId: string): Promise<boolean> {
  memoryActions.delete(companyId);
  const pathname = `${ACTIONS_PREFIX}${encodeURIComponent(companyId)}.json`;
  touch(pathname);
  if (!hasDurable()) return true;
  return blobDeletePath(pathname);
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

// --- dual-register explanations ---

export async function readExplanation(
  key: string
): Promise<StoredExplanation | null> {
  const mem = memoryExplanations.get(key);
  if (mem) return mem;
  if (!hasDurable()) return null;
  try {
    const pathname = `${EXPLAIN_PREFIX}${encodeURIComponent(key)}.json`;
    const body = await blobGetJson<StoredExplanation>(pathname);
    if (body) memoryExplanations.set(key, body);
    return body;
  } catch (err) {
    console.warn("[blob] readExplanation failed:", err);
    return null;
  }
}

export async function writeExplanation(
  key: string,
  layers: { plain: string; technical: string }
): Promise<boolean> {
  const body: StoredExplanation = {
    ...layers,
    saved_at: new Date().toISOString(),
  };
  memoryExplanations.set(key, body);
  if (!hasDurable()) return true;
  const pathname = `${EXPLAIN_PREFIX}${encodeURIComponent(key)}.json`;
  return blobPutJson(pathname, body);
}
