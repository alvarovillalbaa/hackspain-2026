import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model.ts";

export default defineAgent({
  description:
    "Decide the ideal financing amount for a company before any product exists. Uses score, cash, debt and invoice facts. Always justifies why not more via ceiling_reason.",
  ...agentRuntime(),
});
