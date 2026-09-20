import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/xray/score/[companyId]/route";
import { clearStoreMemoryForTests } from "@/lib/xray/store";
import { DEFAULT_GROUP_COMPANIES } from "@/lib/xray/demo";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-score-api-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe("GET /api/xray/score/[companyId]", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("returns a ScoreSnapshot for a demo company", async () => {
    const id = DEFAULT_GROUP_COMPANIES[0]!;
    const res = await GET(new Request(`http://localhost/api/xray/score/${id}`), {
      params: Promise.resolve({ companyId: id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.company_id).toBe(id);
    expect(body.score).toBeGreaterThanOrEqual(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.band).toBeTruthy();
  });

  it("404s unknown companies", async () => {
    const res = await GET(
      new Request("http://localhost/api/xray/score/COMP_NOPE"),
      { params: Promise.resolve({ companyId: "COMP_NOPE" }) }
    );
    expect(res.status).toBe(404);
  });
});
