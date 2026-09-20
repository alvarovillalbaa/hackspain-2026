import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

import { GET, PUT } from "@/app/api/xray/session/route";
import { clearStoreMemoryForTests } from "@/lib/xray/store";
import { DEFAULT_GROUP_ID } from "@/lib/xray/demo";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-session-api-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe("GET/PUT /api/xray/session", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("GET defaults to the demo group", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_id).toBe(DEFAULT_GROUP_ID);
  });

  it("PUT rejects invalid JSON", async () => {
    const res = await PUT(
      new Request("http://localhost/api/xray/session", {
        method: "PUT",
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("PUT rejects unknown groups", async () => {
    const res = await PUT(
      new Request("http://localhost/api/xray/session", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group_id: "GROUP_DOES_NOT_EXIST" }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("PUT pins a known group", async () => {
    const res = await PUT(
      new Request("http://localhost/api/xray/session", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group_id: DEFAULT_GROUP_ID }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).group_id).toBe(DEFAULT_GROUP_ID);
  });
});
