import { defineAgent } from "eve";
import { marketplaceRuntime } from "#lib/model";
import { QuantityDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Decide the ideal financing amount for a company before any product exists. Uses score, cash, debt and invoice facts. Always justifies why not more via ceiling_reason.",
  ...marketplaceRuntime(),
  // Only its own tools/: no bash/read_file (a docker sandbox took 20 s+ to open).
  defaultTools: false,
  outputSchema: QuantityDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
