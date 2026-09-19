import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model.ts";

export default defineAgent({
  ...agentRuntime(),
});
