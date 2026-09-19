import { defineAgent } from "eve";
import { marketplaceRuntime } from "#lib/model";
import { OffersDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Select catalog financing products and quote point terms inside allowable ranges. Has no match tools — cannot see which quote will win.",
  ...marketplaceRuntime(),
  // Only its own tools/: no bash/read_file (a docker sandbox took 20 s+ to open).
  defaultTools: false,
  outputSchema: OffersDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
