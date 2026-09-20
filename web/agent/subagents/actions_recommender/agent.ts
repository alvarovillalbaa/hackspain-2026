import { defineAgent, defineDynamic } from "eve";
import { agentRuntime } from "#lib/model";
import { FichaActionsDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Redacts Spanish description + reasoning for grounded ficha actions. " +
    "Calls get_recommended_actions, never invents amounts or scores. " +
    "Use for ficha action copy — not for marketplace quantity/offering/match.",
  model: defineDynamic({
    events: {
      "step.started": () => agentRuntime(),
    },
  }),
  defaultTools: false,
  outputSchema: FichaActionsDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 4 } },
});
