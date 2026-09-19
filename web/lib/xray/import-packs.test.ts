import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasPrescoredPacks,
  listPrescoredPacks,
  matchPrescoredPack,
  sha256,
} from "./import-packs";

const PACKS_ROOT = join(process.cwd(), "..", "docs", "data", "raw", "new");

/** Digests of the real pack on disk — what the browser would upload. */
function digestsFor(caseName: string) {
  const pack = listPrescoredPacks().find((p) => p.case === caseName)!;
  return pack.files.map((f) => ({
    name: f.name,
    sha256: sha256(readFileSync(join(PACKS_ROOT, caseName, f.name))),
  }));
}

describe("prescored import packs", () => {
  it("ships the group and update packs", () => {
    expect(hasPrescoredPacks()).toBe(true);
    expect(listPrescoredPacks().map((p) => p.case).sort()).toEqual([
      "group",
      "update",
    ]);
  });

  it("carries full Health Scorer records, not just a score", () => {
    const update = listPrescoredPacks().find((p) => p.case === "update")!;
    const [row] = update.scores;
    expect(row?.company_id).toBe("COMP_0001");
    expect(row?.score).toBeCloseTo(55.1, 1);
    expect(row?.dimensions).toBeTruthy();
    expect(row?.history.length).toBeGreaterThan(1);
    expect(row?.drivers.length).toBeGreaterThan(0);
  });

  it("matches the pack when the uploaded bytes are the pack's bytes", () => {
    const pack = matchPrescoredPack(digestsFor("group"), null);
    expect(pack?.case).toBe("group");
    expect(pack?.company_ids).toEqual([
      "COMP_0001",
      "COMP_0793",
      "COMP_0878",
    ]);
  });

  it("refuses a pack whose CSV was edited under the same name", () => {
    const tampered = digestsFor("group");
    tampered[0] = { ...tampered[0]!, sha256: "0".repeat(64) };
    expect(matchPrescoredPack(tampered, null)).toBeNull();
  });

  it("keeps update and group apart by target company", () => {
    // The update pack is only valid remapped onto COMP_0001.
    expect(matchPrescoredPack(digestsFor("update"), null)).toBeNull();
    expect(matchPrescoredPack(digestsFor("update"), "COMP_0001")?.case).toBe(
      "update"
    );
    expect(matchPrescoredPack(digestsFor("group"), "COMP_0001")).toBeNull();
  });

  it("refuses a partial upload", () => {
    expect(matchPrescoredPack(digestsFor("group").slice(0, 3), null)).toBeNull();
  });
});
