import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/xray/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/xray/store")>();
  return {
    ...actual,
    readImportedPack: vi.fn(actual.readImportedPack),
    readStoredActions: vi.fn(actual.readStoredActions),
    readActions: vi.fn(actual.readActions),
    listImportedPacks: vi.fn(actual.listImportedPacks),
    listStoredActions: vi.fn(actual.listStoredActions),
  };
});

import { GET } from "@/app/api/xray/actions/route";
import * as store from "@/lib/xray/store";
import { getExportedScore, getCompanyFacts } from "@/lib/xray/dataset";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import { listCompanyActions } from "@/lib/xray/recommend-actions";
import type { PortfolioAction } from "@/lib/xray/portfolio-actions";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-actions-api-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

/** First fact-pack company that yields grounded actions. */
function firstGroundedCompany(rows: PortfolioAction[]): string {
  return rows[0]!.company_id;
}

describe("GET /api/xray/actions (portfolio)", () => {
  beforeEach(() => {
    store.clearStoreMemoryForTests();
    vi.mocked(store.readImportedPack).mockClear();
    vi.mocked(store.readStoredActions).mockClear();
    vi.mocked(store.readActions).mockClear();
    vi.mocked(store.listImportedPacks).mockClear();
    vi.mocked(store.listStoredActions).mockClear();
  });

  it("never reads the store per company", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as PortfolioAction[];
    expect(rows.length).toBeGreaterThan(50);
    expect(store.readImportedPack).not.toHaveBeenCalled();
    expect(store.readStoredActions).not.toHaveBeenCalled();
    expect(store.readActions).not.toHaveBeenCalled();
  });

  it("overlays stored Eve titles from one prefix listing", async () => {
    const first = (await (await GET()).json()) as PortfolioAction[];
    const companyId = firstGroundedCompany(first);
    const exported = getExportedScore(companyId)!;
    const grounded = listCompanyActions(
      snapshotFromExported(exported),
      getCompanyFacts(companyId),
      exported,
      undefined
    );
    await store.writeActions(
      companyId,
      grounded.map((a) => ({
        ...a,
        title: `Copia Eve para ${a.kind}`,
        origin: "eve" as const,
      })),
      { enriched_at: new Date().toISOString() }
    );

    const rows = (await (await GET()).json()) as PortfolioAction[];
    const mine = rows.filter((r) => r.company_id === companyId);
    // The portfolio is capped at 200 rows, so compare with what was there.
    expect(mine.length).toBe(
      first.filter((r) => r.company_id === companyId).length
    );
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) {
      expect(r.title).toBe(`Copia Eve para ${r.kind}`);
      expect(r.origin).toBe("eve");
    }
    expect(store.readStoredActions).not.toHaveBeenCalled();
  });

  it("memoizes the assembled portfolio until the store changes", async () => {
    const a = await (await GET()).json();
    const b = await (await GET()).json();
    expect(b).toEqual(a);
    expect(store.listImportedPacks).toHaveBeenCalledTimes(1);
    expect(store.listStoredActions).toHaveBeenCalledTimes(1);

    const companyId = firstGroundedCompany(a as PortfolioAction[]);
    await store.invalidateActions(companyId);
    await GET();
    expect(store.listImportedPacks).toHaveBeenCalledTimes(2);
    expect(store.listStoredActions).toHaveBeenCalledTimes(2);
  });
});
