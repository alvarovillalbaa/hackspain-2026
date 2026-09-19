import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model";

export default defineAgent({
  ...agentRuntime(),
});
