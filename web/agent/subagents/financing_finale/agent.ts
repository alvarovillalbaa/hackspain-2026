import { defineAgent, defineDynamic } from "eve";
import { marketplaceRuntime } from "#lib/model";

export default defineAgent({
  description:
    "Marketplace financing pipeline: delegates quantity → offering → match for a company action. " +
    "Use when recommending products or when the message starts with ORCHESTRATOR STAGE. Never invent match%.",
  model: defineDynamic({
    events: {
      "step.started": () => marketplaceRuntime(),
    },
  }),
  defaultTools: false,
  experimental: { workflow: { modelCallsPerStep: 4 } },
});
