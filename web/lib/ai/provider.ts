import { createOpenAI } from "@ai-sdk/openai";
import { createGateway } from "ai";
import {
  isLlmFailoverFatal,
  LlmCallError,
  MissingLlmKeyError,
} from "./errors";

const HELM_BASE_URL = "https://api.helmcode.com/v1";
/** Ficha + chat. Slow, high-quality copy. */
export const HELM_FICHA_MODEL = "glm5.3";
/** Marketplace / explain. Fast tool-calling. */
export const HELM_FLASH_MODEL = "deepseek-v4-flash";
/** Gateway catalog ids when only AI_GATEWAY_API_KEY / OIDC is present. */
export const GATEWAY_FICHA_MODEL = "openai/gpt-5.6-luna";
export const GATEWAY_FLASH_MODEL = "openai/gpt-5.6-luna-fast";

export const HELM_CONTEXT_WINDOW = 128_000;

export type LlmRole = "ficha" | "flash";
export type LlmBackend = "helmcode" | "gateway";

export type ResolvedModel = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  backend: LlmBackend;
  modelId: string;
};

export type EnvLike = {
  OPENAI_API_KEY?: string | undefined;
  AI_GATEWAY_API_KEY?: string | undefined;
  VERCEL?: string | undefined;
  [key: string]: string | undefined;
};

function hasValue(v: string | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function canUseHelmcode(env: EnvLike): boolean {
  return hasValue(env.OPENAI_API_KEY);
}

function canUseGateway(env: EnvLike): boolean {
  return hasValue(env.AI_GATEWAY_API_KEY) || hasValue(env.VERCEL);
}

/**
 * Failover order for simple AI SDK calls: Gateway (AI SDK catalog) then Helmcode.
 * Eve does not walk this list.
 */
export function listAvailableBackends(env: EnvLike = process.env): LlmBackend[] {
  const have: LlmBackend[] = [];
  if (canUseGateway(env)) have.push("gateway");
  if (canUseHelmcode(env)) have.push("helmcode");
  if (have.length === 0) throw new MissingLlmKeyError();
  return have;
}

/**
 * Eve's single backend: Helmcode when OPENAI_API_KEY is set, else Gateway.
 * No live retry — a failed Eve call stays failed.
 */
export function resolveBackend(env: EnvLike = process.env): LlmBackend {
  if (canUseHelmcode(env)) return "helmcode";
  if (canUseGateway(env)) return "gateway";
  throw new MissingLlmKeyError();
}

function modelIdFor(role: LlmRole, backend: LlmBackend): string {
  if (backend === "helmcode") {
    return role === "ficha" ? HELM_FICHA_MODEL : HELM_FLASH_MODEL;
  }
  return role === "ficha" ? GATEWAY_FICHA_MODEL : GATEWAY_FLASH_MODEL;
}

function assertBackend(backend: LlmBackend, env: EnvLike): void {
  if (backend === "helmcode" && !canUseHelmcode(env)) {
    throw new MissingLlmKeyError();
  }
  if (backend === "gateway" && !canUseGateway(env)) {
    throw new MissingLlmKeyError();
  }
}

/**
 * Bind one backend. Helmcode = OpenAI-compatible Helm API.
 * Gateway = Vercel AI Gateway catalog (AI SDK default path).
 */
export function resolveLanguageModel(
  role: LlmRole,
  env: EnvLike = process.env,
  backend: LlmBackend = resolveBackend(env)
): ResolvedModel {
  assertBackend(backend, env);
  const modelId = modelIdFor(role, backend);

  if (backend === "helmcode") {
    const model = createOpenAI({
      baseURL: HELM_BASE_URL,
      apiKey: env.OPENAI_API_KEY,
    }).chat(modelId);
    return { model, backend, modelId };
  }

  const gateway = createGateway(
    hasValue(env.AI_GATEWAY_API_KEY)
      ? { apiKey: env.AI_GATEWAY_API_KEY }
      : undefined
  );
  return { model: gateway(modelId), backend, modelId };
}

/** Simple AI SDK calls: Gateway, then Helmcode if that throw is retryable. */
export async function withBackendFailover<T>(
  role: LlmRole,
  run: (resolved: ResolvedModel) => Promise<T>,
  env: EnvLike = process.env
): Promise<T> {
  const backends = listAvailableBackends(env);
  let last: unknown;
  const tried: LlmBackend[] = [];
  for (const backend of backends) {
    tried.push(backend);
    const resolved = resolveLanguageModel(role, env, backend);
    try {
      return await run(resolved);
    } catch (err) {
      if (isLlmFailoverFatal(err)) throw err;
      last = err;
      if (backend !== backends[backends.length - 1]) {
        console.warn(
          `[llm] ${backend}/${resolved.modelId} failed, trying next`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }
  throw new LlmCallError(
    last instanceof Error ? last.message : "all LLM backends failed",
    last,
    tried
  );
}

export type AgentRuntime = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  modelContextWindowTokens: number;
};

/** Eve ficha / chat — one model, no provider failover. */
export function agentRuntime(env: EnvLike = process.env): AgentRuntime {
  const { model } = resolveLanguageModel("ficha", env);
  return { model, modelContextWindowTokens: HELM_CONTEXT_WINDOW };
}

/** Eve marketplace / watcher / flash — one model, no provider failover. */
export function marketplaceRuntime(env: EnvLike = process.env): AgentRuntime {
  const { model } = resolveLanguageModel("flash", env);
  return { model, modelContextWindowTokens: HELM_CONTEXT_WINDOW };
}

/** Every marketplace stage prompt starts with this; root model resolver keys on it. */
export const MARKETPLACE_STAGE_PREFIX = "ORCHESTRATOR STAGE";

/**
 * Root `step.started` resolver: marketplace stage turns → flash; chat → ficha.
 */
export function rootRuntime(
  messages: readonly { role: string; content: unknown }[],
  env: EnvLike = process.env
): AgentRuntime {
  const first = messages.find((m) => m.role === "user")?.content;
  const text =
    typeof first === "string"
      ? first
      : Array.isArray(first)
        ? first
            .map((p) => (p as { text?: string }).text ?? "")
            .join("")
        : "";
  return text.startsWith(MARKETPLACE_STAGE_PREFIX)
    ? marketplaceRuntime(env)
    : agentRuntime(env);
}
