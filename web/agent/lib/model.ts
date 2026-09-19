import { createOpenAI } from "@ai-sdk/openai";

const HELM_BASE_URL = "https://api.helmcode.com/v1";
const HELM_MODEL = "glm5.3";
const HELM_CONTEXT_WINDOW = 128_000;

/** Helmcode glm5.3. Only OPENAI_API_KEY comes from the environment. */
export function agentRuntime(): {
  model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;
  modelContextWindowTokens: number;
} {
  return {
    model: createOpenAI({
      baseURL: HELM_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    }).chat(HELM_MODEL),
    modelContextWindowTokens: HELM_CONTEXT_WINDOW,
  };
}
