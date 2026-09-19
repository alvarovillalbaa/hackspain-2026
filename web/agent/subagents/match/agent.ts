import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model.ts";

export default defineAgent({
  description:
    "Score each offer against the company using deterministic compute_match. Receives structured terms only — never offering prose. Sorts by match.",
  ...agentRuntime(),
});
