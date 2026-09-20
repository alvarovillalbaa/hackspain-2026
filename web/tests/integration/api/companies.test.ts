import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/xray/companies/route";
import { clearStoreMemoryForTests } from "@/lib/xray/store";
import { DEFAULT_GROUP_COMPANIES } from "@/lib/xray/demo";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-companies-api-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe("GET /api/xray/companies", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("returns the fact-pack companies with the demo group present", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.companies.length).toBeGreaterThan(100);
    const ids = new Set(body.companies.map((c: { company_id: string }) => c.company_id));
    for (const id of DEFAULT_GROUP_COMPANIES) {
      expect(ids.has(id)).toBe(true);
    }
  });
});
