import { defineAgent } from "eve";
import { marketplaceRuntime } from "#lib/model";
import { TermsDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Select catalog financing products and quote point terms (amount, rate, dates) inside allowable ranges. Optimizes for the issuer. Has no match tools.",
  ...marketplaceRuntime(),
  // Only its own tools/: no bash/read_file (a docker sandbox took 20 s+ to open).
  defaultTools: false,
  outputSchema: TermsDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
