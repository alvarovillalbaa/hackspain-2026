import { expect, it, vi } from "vitest";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/xray/recommend/route";
import { clearStoreMemoryForTests } from "@/lib/xray/store";
import { invalidateRecommendCache } from "@/lib/xray/recommend-cache";

it.skipIf(process.env.XRAY_LIVE_MARKETPLACE !== "1")("generates and persists a real marketplace recommendation, then reads it without the provider", async () => {
  process.env.XRAY_RUNTIME_DIR = resolve("data/runtime");
  const companyId = "COMP_0793";
  const request = () => new Request("http://localhost/api/xray/recommend", {
    method: "POST",
    body: JSON.stringify({ company_id: companyId, action_id: `${companyId}-new_debt-0` }),
  });
  const start = performance.now();
  const first = await POST(request());
  const generated = await first.json();
  expect(first.status, JSON.stringify(generated)).toBe(200);
  expect(generated).toMatchObject({ source: "agent", persisted: true });
  expect(generated.matches.length).toBeGreaterThan(0);
  console.log(JSON.stringify({ phase: "first", ms: Math.round(performance.now() - start), cached: generated.cached, offers: generated.matches.length }));
  clearStoreMemoryForTests();
  invalidateRecommendCache(companyId);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL", "");
  try {
    const diskStart = performance.now();
    const second = await POST(request());
    const cached = await second.json();
    expect(second.status).toBe(200);
    expect(cached).toMatchObject({ cached: true, persisted: true, source: "agent", matches: generated.matches });
    console.log(JSON.stringify({ phase: "disk-without-provider", ms: Math.round(performance.now() - diskStart), offers: cached.matches.length }));
  } finally {
    vi.unstubAllEnvs();
  }
}, 260_000);
