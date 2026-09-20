import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { runMarketplaceAgent, type MarketplaceAgentInput } from "@/agent/lib/marketplace";
import { getCompanyFacts, getDatasetCompany, getExportedScore } from "@/lib/xray/dataset";
import { snapshotFromExported } from "@/lib/xray/snapshot";
import { listCompanyActions } from "@/lib/xray/recommend-actions";
import { reassembleMatches } from "@/lib/xray/reassemble";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateText: vi.fn(), tool: (definition: unknown) => definition }));
vi.mock("@/lib/ai/provider", () => ({ resolveLanguageModel: () => ({ model: {} }) }));

function input(amount?: number): MarketplaceAgentInput {
  const company = getDatasetCompany("COMP_0793")!;
  const exported = getExportedScore(company.company_id)!;
  const snapshot = snapshotFromExported(exported);
  const facts = getCompanyFacts(company.company_id)!;
  const action = listCompanyActions(snapshot, facts, exported, company.currency).find((a) => a.kind === "new_debt")!;
  return { company, snapshot, facts, action, amount, signal: new AbortController().signal, onPhase: vi.fn() };
}

const toolOptions = { toolCallId: "test", messages: [], context: undefined };
const copy = {
  quantity_reasoning: "Financiar el ciclo de caja sin incrementar deuda innecesaria.",
  risks: ["Revisar cobertura de deuda."],
  headline: "Financiación ajustada al ciclo de caja",
};

beforeEach(() => {
  vi.mocked(generateText).mockReset();
});

describe("direct marketplace agent", () => {
  it("uses one agent with batched evaluation, retaining calculator values in the result", async () => {
    const ctx = input(100_000);
    let ids: string[] = [];
    vi.mocked(generateText).mockImplementation(async (options) => {
      const prompt = JSON.parse(options.prompt as string);
      expect(prompt.allowed_amounts).toEqual([100_000]);
      expect(prompt.facts).toEqual(ctx.facts);
      ids = prompt.catalog.filter((p: { amount_min: number; amount_max: number }) => p.amount_min <= 100_000 && p.amount_max >= 100_000)
        .slice(0, 3).map((p: { product_id: string }) => p.product_id);
      const evaluated = await options.tools!.evaluate_offers!.execute!({ amount: 100_000, product_ids: ids }, toolOptions);
      expect(evaluated).toHaveLength(ids.length);
      await options.tools!.submit_recommendation!.execute!({
        ...copy,
        ranking: ids.map((product_id) => ({ product_id, reasoning: "Plazo y ticket adecuados al ciclo de caja." })),
      }, toolOptions);
      return {} as never;
    });
    const result = await runMarketplaceAgent(ctx);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.quantity.ideal_amount).toBe(100_000);
    expect(result.terms.map((t) => t.product_id)).toEqual(ids);
    expect(result.quantity.reasoning).toBe(copy.quantity_reasoning);
    expect(reassembleMatches(result, ctx.snapshot, ctx.action, "llm", ctx.facts)).toHaveLength(ids.length);
    expect(ctx.onPhase).toHaveBeenCalledWith("match", expect.any(String));
  });

  it("rejects fabricated amounts, wrong catalog products and fabricated final selections", async () => {
    vi.mocked(generateText).mockImplementation(async (options) => {
      const evaluate = options.tools!.evaluate_offers!.execute!;
      await expect(evaluate({ amount: 123, product_ids: ["invented"] }, toolOptions)).rejects.toThrow("allowed_amounts");
      await expect(evaluate({ amount: 100_000, product_ids: ["invented"] }, toolOptions)).rejects.toThrow("does not cover");
      const prompt = JSON.parse(options.prompt as string);
      const id = prompt.catalog.find((p: { amount_min: number; amount_max: number }) => p.amount_min <= 100_000 && p.amount_max >= 100_000).product_id;
      await evaluate({ amount: 100_000, product_ids: [id] }, toolOptions);
      await expect(options.tools!.submit_recommendation!.execute!({
        ...copy, ranking: [{ product_id: "invented", reasoning: "Inventado" }],
      }, toolOptions)).rejects.toThrow("evaluated products");
      return {} as never;
    });
    await expect(runMarketplaceAgent(input(100_000))).rejects.toThrow("no entregó");
  });

  it("propagates provider failures without inventing an alternative recommendation", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("Provider unavailable"));
    await expect(runMarketplaceAgent(input())).rejects.toThrow("Provider unavailable");
  });

  it("does not invoke a model after cancellation", async () => {
    const ctx = input();
    ctx.signal = AbortSignal.abort();
    await expect(runMarketplaceAgent(ctx)).rejects.toThrow();
    expect(generateText).not.toHaveBeenCalled();
  });
});
