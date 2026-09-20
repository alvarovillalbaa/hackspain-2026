import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
vi.mock("@/agent/lib/marketplace", () => ({
  MARKETPLACE_AGENT_VERSION: "test-v1",
  runMarketplaceAgent: vi.fn(),
}));
vi.mock("@/lib/xray/marketplace-orchestrator", () => ({
  runMarketplacePipeline: vi.fn().mockRejectedValue(new Error("Legacy pipeline must not run")),
}));

import { POST } from "@/app/api/xray/recommend/route";
import { runMarketplaceAgent } from "@/agent/lib/marketplace";
import { getCompanyFacts, getDatasetCompany, getExportedScore } from "@/lib/xray/dataset";
import { clearStoreMemoryForTests, writeImportedPack } from "@/lib/xray/store";
import { invalidateRecommendCache } from "@/lib/xray/recommend-cache";
import { listProducts } from "@/lib/xray/catalog";
import { TimeoutError } from "@/lib/ai/errors";
import type { RecommendationDecision } from "@/agent/lib/schemas";

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-recommend-api-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;
const companyId = "COMP_0793";
const actionId = `${companyId}-new_debt-0`;
const product = listProducts({ kind: "new_debt" })[0]!;

function decision(amount = 100_000): RecommendationDecision {
  return {
    company_id: companyId,
    action_id: actionId,
    action_kind: "new_debt",
    quantity: {
      company_id: companyId,
      action_kind: "new_debt",
      ideal_amount: amount,
      reasoning: "Financiar el ciclo de caja sin acumular deuda innecesaria.",
      risks: ["Revisar la cobertura del servicio de deuda."],
    },
    terms: [{
      product_id: product.product_id,
      amount,
      interest_rate: product.rate_min,
      start_date: "2026-09-20",
      end_date: "2028-09-20",
    }],
    ranking: [{ product_id: product.product_id, reasoning: "Plazo ajustado al ciclo de caja." }],
    headline: "Financiación para el ciclo de caja",
  };
}

function request(amount?: number, action_id = actionId) {
  return new Request("http://localhost/api/xray/recommend", {
    method: "POST",
    body: JSON.stringify({ company_id: companyId, action_id, amount }),
  });
}

function restart() {
  clearStoreMemoryForTests();
  invalidateRecommendCache(companyId);
}

beforeEach(() => {
  restart();
  rmSync(runtimeDir, { recursive: true, force: true });
  vi.mocked(runMarketplaceAgent).mockReset().mockResolvedValue(decision());
});

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

describe("POST /api/xray/recommend", () => {
  it("saves a real agent result before responding and reuses it after restart", async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result).toMatchObject({ source: "agent", cached: false, persisted: true });
    expect(result.matches.length).toBeGreaterThan(0);
    restart();
    vi.mocked(runMarketplaceAgent).mockRejectedValue(new Error("Provider offline"));
    const cached = await POST(request());
    expect(cached.status).toBe(200);
    expect(await cached.json()).toMatchObject({
      source: "agent", cached: true, persisted: true, matches: result.matches,
    });
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(1);
  });

  it("persists custom amounts separately instead of reusing a different decision", async () => {
    await POST(request());
    vi.mocked(runMarketplaceAgent).mockResolvedValue(decision(150_000));
    expect((await POST(request(150_000))).status).toBe(200);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(2);
    restart();
    expect((await (await POST(request(150_000))).json()).cached).toBe(true);
    expect((await (await POST(request())).json()).cached).toBe(true);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent requests for the same inputs", async () => {
    const results = await Promise.all([POST(request()), POST(request())]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(1);
  });

  it("invalidates changed facts and reuses imported results after restart", async () => {
    await POST(request());
    const facts = getCompanyFacts(companyId)!;
    await writeImportedPack({
      company: getDatasetCompany(companyId)!,
      score: getExportedScore(companyId)!,
      facts: { ...facts, cash_balance: facts.cash_balance + 1 },
    });
    expect((await POST(request())).status).toBe(200);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(2);
    restart();
    expect((await (await POST(request())).json()).cached).toBe(true);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(2);
  });

  it("does not cache errors or substitute deterministic offers", async () => {
    vi.mocked(runMarketplaceAgent).mockRejectedValueOnce(new TimeoutError("Provider timeout"));
    expect((await POST(request())).status).toBe(504);
    expect((await POST(request())).status).toBe(200);
    expect(runMarketplaceAgent).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown actions before calling the model", async () => {
    expect((await POST(request(undefined, "unknown"))).status).toBe(404);
    expect(runMarketplaceAgent).not.toHaveBeenCalled();
  });
});
