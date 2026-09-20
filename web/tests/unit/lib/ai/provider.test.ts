import { afterEach, describe, expect, it } from "vitest";
import { LlmCallError, MissingLlmKeyError } from "@/lib/ai/errors";
import {
  GATEWAY_FICHA_MODEL,
  GATEWAY_FLASH_MODEL,
  HELM_FICHA_MODEL,
  HELM_FLASH_MODEL,
  MARKETPLACE_STAGE_PREFIX,
  agentRuntime,
  listAvailableBackends,
  marketplaceRuntime,
  resolveBackend,
  resolveLanguageModel,
  rootRuntime,
  withBackendFailover,
} from "@/lib/ai/provider";

const saved = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("listAvailableBackends", () => {
  it("orders Gateway then Helmcode for simple AI SDK failover", () => {
    expect(
      listAvailableBackends({
        OPENAI_API_KEY: "sk-helm",
        AI_GATEWAY_API_KEY: "gw",
        VERCEL: "1",
      })
    ).toEqual(["gateway", "helmcode"]);
  });

  it("is Gateway-only when Helmcode key is missing", () => {
    expect(listAvailableBackends({ AI_GATEWAY_API_KEY: "gw" })).toEqual([
      "gateway",
    ]);
  });

  it("is Helmcode-only when Gateway is unavailable", () => {
    expect(listAvailableBackends({ OPENAI_API_KEY: "sk" })).toEqual([
      "helmcode",
    ]);
  });
});

describe("resolveBackend", () => {
  it("prefers Helmcode when OPENAI_API_KEY is set", () => {
    expect(
      resolveBackend({
        OPENAI_API_KEY: "sk-helm",
        AI_GATEWAY_API_KEY: "gw",
        VERCEL: "1",
      })
    ).toBe("helmcode");
  });

  it("falls back to Gateway when only AI_GATEWAY_API_KEY is set", () => {
    expect(resolveBackend({ AI_GATEWAY_API_KEY: "gw" })).toBe("gateway");
  });

  it("falls back to Gateway on Vercel OIDC without explicit gateway key", () => {
    expect(resolveBackend({ VERCEL: "1" })).toBe("gateway");
  });

  it("throws MissingLlmKeyError when nothing is set", () => {
    expect(() => resolveBackend({})).toThrow(MissingLlmKeyError);
  });
});

describe("resolveLanguageModel", () => {
  it("returns Helmcode model ids", () => {
    const ficha = resolveLanguageModel("ficha", { OPENAI_API_KEY: "sk" });
    expect(ficha.backend).toBe("helmcode");
    expect(ficha.modelId).toBe(HELM_FICHA_MODEL);
    expect(ficha.model.modelId).toBe(HELM_FICHA_MODEL);

    const flash = resolveLanguageModel("flash", { OPENAI_API_KEY: "sk" });
    expect(flash.modelId).toBe(HELM_FLASH_MODEL);
  });

  it("returns Gateway model ids", () => {
    const ficha = resolveLanguageModel("ficha", { AI_GATEWAY_API_KEY: "gw" });
    expect(ficha.backend).toBe("gateway");
    expect(ficha.modelId).toBe(GATEWAY_FICHA_MODEL);

    const flash = resolveLanguageModel("flash", { AI_GATEWAY_API_KEY: "gw" });
    expect(flash.modelId).toBe(GATEWAY_FLASH_MODEL);
  });
});

describe("withBackendFailover", () => {
  const both = { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" };

  it("uses Gateway when it succeeds and does not call Helmcode", async () => {
    const seen: string[] = [];
    const result = await withBackendFailover(
      "ficha",
      async ({ backend }) => {
        seen.push(backend);
        return "from-gateway";
      },
      both
    );
    expect(result).toBe("from-gateway");
    expect(seen).toEqual(["gateway"]);
  });

  it("Helmcode rescues a Gateway failure", async () => {
    const seen: string[] = [];
    const result = await withBackendFailover(
      "flash",
      async ({ backend }) => {
        seen.push(backend);
        if (backend === "gateway") throw new Error("gateway 429");
        return "from-helm";
      },
      both
    );
    expect(result).toBe("from-helm");
    expect(seen).toEqual(["gateway", "helmcode"]);
  });

  it("Gateway-only does not invent a Helmcode attempt", async () => {
    const seen: string[] = [];
    await expect(
      withBackendFailover(
        "flash",
        async ({ backend }) => {
          seen.push(backend);
          throw new Error(`${backend} down`);
        },
        { AI_GATEWAY_API_KEY: "gw" }
      )
    ).rejects.toBeInstanceOf(LlmCallError);
    expect(seen).toEqual(["gateway"]);
  });

  it("does not try Helmcode on abort", async () => {
    const seen: string[] = [];
    const abort = new Error("cancelled");
    abort.name = "AbortError";
    await expect(
      withBackendFailover(
        "flash",
        async ({ backend }) => {
          seen.push(backend);
          throw abort;
        },
        both
      )
    ).rejects.toBe(abort);
    expect(seen).toEqual(["gateway"]);
  });

  it("wraps exhaustion in LlmCallError with tried backends", async () => {
    try {
      await withBackendFailover(
        "flash",
        async () => {
          throw new Error("nope");
        },
        both
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LlmCallError);
      expect((err as LlmCallError).tried).toEqual(["gateway", "helmcode"]);
      expect((err as LlmCallError).message).toBe("nope");
    }
  });
});

describe("Eve runtimes (no failover)", () => {
  const both = { OPENAI_API_KEY: "sk", AI_GATEWAY_API_KEY: "gw" };

  it("binds Helmcode only, even when Gateway is also configured", () => {
    const ficha = agentRuntime(both);
    const flash = marketplaceRuntime(both);
    expect(ficha.model.modelId).toBe(HELM_FICHA_MODEL);
    expect(flash.model.modelId).toBe(HELM_FLASH_MODEL);
    expect(resolveLanguageModel("ficha", both).backend).toBe("helmcode");
  });
});

describe("rootRuntime", () => {
  it("routes orchestrator stage turns to flash and chat to ficha", () => {
    const env = { OPENAI_API_KEY: "sk" };
    const stage = `${MARKETPLACE_STAGE_PREFIX} 1/3 quantity`;
    const modelId = (m: { model: { modelId: string } }) => m.model.modelId;

    expect(modelId(rootRuntime([{ role: "user", content: stage }], env))).toBe(
      HELM_FLASH_MODEL
    );
    expect(
      modelId(
        rootRuntime(
          [{ role: "user", content: [{ type: "text", text: stage }] }],
          env
        )
      )
    ).toBe(HELM_FLASH_MODEL);
    expect(
      modelId(rootRuntime([{ role: "user", content: "Resume la ficha" }], env))
    ).toBe(HELM_FICHA_MODEL);
    expect(modelId(rootRuntime([], env))).toBe(HELM_FICHA_MODEL);
  });
});
