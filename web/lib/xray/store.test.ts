import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearStoreMemoryForTests,
  deleteDeal,
  deleteDealsForCompanies,
  readActions,
  readDeal,
  readImportedPack,
  readSession,
  writeActions,
  writeDeal,
  writeImportedPack,
  writeSession,
} from "./store";
import { DEFAULT_GROUP_ID } from "./demo";
import type { AcceptedDeal, ActionRecommendation } from "./types";
import type { ExportedScore } from "./dataset/types";

// Never let the in-repo tier write into web/data/runtime/ from a test.
const runtimeDir = mkdtempSync(join(tmpdir(), "xray-store-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

function deal(over: Partial<AcceptedDeal> = {}): AcceptedDeal {
  return {
    company_id: "COMP_0001",
    action_id: "COMP_0001-refinance-0",
    product_id: "PROD_1",
    label: "Préstamo",
    issuer_name: "Banco Demo",
    amount: 120_000,
    projected_score: 56,
    projected_band: "BB",
    uplift: 4,
    accepted_at: "2026-09-19T12:00:00.000Z",
    ...over,
  };
}

describe("store (memory path)", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("defaults session to GROUP_0147", async () => {
    const s = await readSession();
    expect(s.group_id).toBe(DEFAULT_GROUP_ID);
  });

  it("writes and reads session", async () => {
    await writeSession("GROUP_0001");
    expect((await readSession()).group_id).toBe("GROUP_0001");
  });

  it("saves and reads a deal by company", async () => {
    await writeDeal(deal());
    expect((await readDeal("COMP_0001"))?.product_id).toBe("PROD_1");
    expect(await readDeal("COMP_9999")).toBeNull();
  });

  it("overwrites the previous deal for the same company", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ product_id: "PROD_2", uplift: 8 }));
    const d = await readDeal("COMP_0001");
    expect(d?.product_id).toBe("PROD_2");
    expect(d?.uplift).toBe(8);
  });

  it("clears one company deal", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ company_id: "COMP_0002" }));
    await deleteDeal("COMP_0001");
    expect(await readDeal("COMP_0001")).toBeNull();
    expect(await readDeal("COMP_0002")).not.toBeNull();
  });

  it("clears deals for re-imported companies", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ company_id: "COMP_0002" }));
    await deleteDealsForCompanies(["COMP_0001"]);
    expect(await readDeal("COMP_0001")).toBeNull();
    expect(await readDeal("COMP_0002")).not.toBeNull();
  });

  it("persists Eve ficha actions in memory", async () => {
    const actions: ActionRecommendation[] = [
      {
        id: "COMP_0001-amortize-0",
        kind: "amortize",
        title: "Amortizar",
        rationale: "Caja ociosa",
        recommended_amount: 50_000,
        dimension_deltas: { debt: 0.1 },
        uplift: 3,
        origin: "deterministic",
      },
    ];
    await writeActions("COMP_0001", actions);
    expect(await readActions("COMP_0001")).toEqual(actions);
    expect(await readActions("COMP_9999")).toBeNull();
  });
});

/**
 * What the in-repo tier has to guarantee: everything the platform generates
 * outlives the process. Dropping the memory maps stands in for a restart, so
 * a value that still reads back can only have come off disk.
 */
describe("store (in-repo JSON tier)", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
    rmSync(runtimeDir, { recursive: true, force: true });
  });

  it("keeps an accepted deal across a restart", async () => {
    await writeDeal(deal({ uplift: 7 }));
    clearStoreMemoryForTests();
    expect((await readDeal("COMP_0001"))?.uplift).toBe(7);
  });

  it("keeps the active group across a restart", async () => {
    await writeSession("GROUP_0099");
    clearStoreMemoryForTests();
    expect((await readSession()).group_id).toBe("GROUP_0099");
  });

  it("keeps an imported company pack across a restart", async () => {
    await writeImportedPack({
      company: {
        company_id: "COMP_8888",
        group_id: "GROUP_IMPORT",
        name: "Importada",
        country: "ES",
        currency: "EUR",
        n_companies_in_group: 1,
      },
      score: { company_id: "COMP_8888", score: 61 } as unknown as ExportedScore,
      facts: null,
    });
    clearStoreMemoryForTests();
    const pack = await readImportedPack("COMP_8888");
    expect(pack?.company.name).toBe("Importada");
    expect(pack?.company.imported).toBe(true);
  });

  it("deleting a deal removes it from disk too", async () => {
    await writeDeal(deal());
    await deleteDeal("COMP_0001");
    clearStoreMemoryForTests();
    expect(await readDeal("COMP_0001")).toBeNull();
  });
});
