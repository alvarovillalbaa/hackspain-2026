import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model";
import { RankingDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Score each offer against the company using deterministic compute_match. Receives structured terms only — never offering prose. Sorts by match.",
  ...agentRuntime(),
  outputSchema: RankingDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
