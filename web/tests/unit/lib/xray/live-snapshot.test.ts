import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { resolveLiveSnapshot } from "@/lib/xray/live-snapshot";
import {
  clearStoreMemoryForTests,
  writeImportedPack,
} from "@/lib/xray/store";
import { DEFAULT_GROUP_COMPANIES } from "@/lib/xray/demo";
import scoresJson from "@/lib/xray/dataset/scores.json";
import type { ExportedScore } from "@/lib/xray/dataset/types";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-live-snap-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe("resolveLiveSnapshot", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("reads the committed fact pack", async () => {
    const id = DEFAULT_GROUP_COMPANIES[0]!;
    const snap = await resolveLiveSnapshot(id);
    expect(snap?.company_id).toBe(id);
    expect(snap!.score).toBeGreaterThanOrEqual(0);
  });

  it("prefers an imported pack over the fact pack", async () => {
    const id = DEFAULT_GROUP_COMPANIES[0]!;
    const base = (scoresJson as ExportedScore[]).find(
      (s) => s.company_id === id
    )!;
    const bumped = { ...base, score: 12.3 };
    await writeImportedPack({
      company: {
        company_id: id,
        group_id: "GROUP_0147",
        name: "Test",
        country: "ES",
        currency: "EUR",
        n_companies_in_group: 3,
        imported: true,
      },
      score: bumped,
      facts: null,
    });
    const snap = await resolveLiveSnapshot(id);
    expect(snap?.score).toBe(12.3);
  });

  it("returns null for unknown companies", async () => {
    expect(await resolveLiveSnapshot("COMP_MISSING")).toBeNull();
  });
});
