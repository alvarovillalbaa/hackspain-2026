import { defineAgent, defineDynamic } from "eve";
import { marketplaceRuntime } from "#lib/model";
import { TermsDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Select catalog financing products and quote point terms (amount, rate, dates) inside allowable ranges. Optimizes for the issuer. Has no match tools.",
  model: defineDynamic({
    events: {
      "step.started": () => marketplaceRuntime(),
    },
  }),
  defaultTools: false,
  outputSchema: TermsDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
