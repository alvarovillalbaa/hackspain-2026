import { createOpenAI } from "@ai-sdk/openai";

const HELM_BASE_URL = "https://api.helmcode.com/v1";
/** Ficha + chat. Slow, high-quality copy. */
const HELM_FICHA_MODEL = "glm5.3";
/** Marketplace specialists (quantity / offering / match). Fast tool-calling. */
const HELM_MARKETPLACE_MODEL = "deepseek-v4-flash";
const HELM_CONTEXT_WINDOW = 128_000;

function helmChat(model: string) {
  return createOpenAI({
    baseURL: HELM_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY,
  }).chat(model);
}

type AgentRuntime = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  modelContextWindowTokens: number;
};

/**
 * Helmcode glm5.3. Only OPENAI_API_KEY comes from the environment.
 * `as never` bridges duplicate @ai-sdk/provider copies (@ai-sdk/openai vs ai/eve).
 */
export function agentRuntime(): AgentRuntime {
  return {
    model: helmChat(HELM_FICHA_MODEL),
    modelContextWindowTokens: HELM_CONTEXT_WINDOW,
  };
}

/** Same Helmcode key; faster model for the quantity → offering → match pipeline. */
export function marketplaceRuntime(): AgentRuntime {
  return {
    model: helmChat(HELM_MARKETPLACE_MODEL),
    modelContextWindowTokens: HELM_CONTEXT_WINDOW,
  };
}

/** Every marketplace stage prompt starts with this; the root model resolver keys on it. */
export const MARKETPLACE_STAGE_PREFIX = "ORCHESTRATOR STAGE";

/**
 * Root `step.started` resolver: the same root agent dispatches quantity/offering/match
 * (fast model) and writes ficha/chat (slow model). Decided by the first user message.
 */
export function rootRuntime(
  messages: readonly { role: string; content: unknown }[]
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
    ? marketplaceRuntime()
    : agentRuntime();
}
