import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model";
import { OffersDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Select catalog financing products and quote point terms inside allowable ranges. Has no match tools — cannot see which quote will win.",
  ...agentRuntime(),
  outputSchema: OffersDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
