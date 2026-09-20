/**
 * Eve model runtimes — re-export the shared fail-closed resolver so `#lib/model`
 * and existing marketplace tests keep working.
 *
 * Relative import (not `@/`) so Eve's agent bundler can resolve it.
 */
export {
  agentRuntime,
  marketplaceRuntime,
  rootRuntime,
  MARKETPLACE_STAGE_PREFIX,
  HELM_FICHA_MODEL,
  HELM_FLASH_MODEL as HELM_MARKETPLACE_MODEL,
  GATEWAY_FICHA_MODEL,
  GATEWAY_FLASH_MODEL,
  resolveLanguageModel,
  resolveBackend,
  listAvailableBackends,
  withBackendFailover,
  type AgentRuntime,
  type LlmRole,
  type LlmBackend,
} from "../../lib/ai/provider";
