import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearStoreMemoryForTests,
  getStoreVersion,
  invalidateActions,
  listStoredActions,
  readImportedPack,
  readStoredActions,
  writeActions,
  writeImportedPack,
} from "@/lib/xray/store";
import type { ActionRecommendation } from "@/lib/xray/types";
import type { ExportedScore } from "@/lib/xray/dataset/types";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-store-listing-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

function action(companyId: string, kind: ActionRecommendation["kind"]): ActionRecommendation {
  return {
    id: `${companyId}-${kind}-0`,
    kind,
    title: `t-${kind}`,
    rationale: "r",
    recommended_amount: 1000,
    uplift: 1,
    dimension_deltas: {},
    origin: "deterministic",
  };
}

describe("store listing + negative cache", () => {
  beforeEach(() => clearStoreMemoryForTests());

  it("lists every stored actions file keyed by company id", async () => {
    await writeActions("COMP_A", [action("COMP_A", "amortize")]);
    await writeActions("COMP B/x", [action("COMP B/x", "refinance")]);
    clearStoreMemoryForTests();
    const all = await listStoredActions();
    expect([...all.keys()].sort()).toEqual(["COMP B/x", "COMP_A"]);
    expect(all.get("COMP_A")!.actions[0]!.kind).toBe("amortize");
    // Listing warms the per-company reader.
    expect((await readStoredActions("COMP_A"))!.actions.length).toBe(1);
  });

  it("bumps the store version on every write or invalidation", async () => {
    const v0 = getStoreVersion();
    await writeActions("COMP_A", [action("COMP_A", "amortize")]);
    const v1 = getStoreVersion();
    expect(v1).toBeGreaterThan(v0);
    await invalidateActions("COMP_A");
    expect(getStoreVersion()).toBeGreaterThan(v1);
    const v2 = getStoreVersion();
    await writeImportedPack({
      company: {
        company_id: "COMP_A",
        group_id: "G1",
        name: "A",
        country: null,
        currency: "EUR",
        n_companies_in_group: 1,
      },
      score: { company_id: "COMP_A" } as unknown as ExportedScore,
      facts: null,
    });
    expect(getStoreVersion()).toBeGreaterThan(v2);
  });

  it("remembers a miss until that path is written", async () => {
    expect(await readImportedPack("COMP_MISSING")).toBeNull();
    expect(await readStoredActions("COMP_MISSING")).toBeNull();
    // A write after a miss must be visible at once.
    await writeActions("COMP_MISSING", [action("COMP_MISSING", "amortize")]);
    expect((await readStoredActions("COMP_MISSING"))!.actions.length).toBe(1);
  });
});
