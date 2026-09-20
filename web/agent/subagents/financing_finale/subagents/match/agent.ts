import { defineAgent, defineDynamic } from "eve";
import { marketplaceRuntime } from "#lib/model";
import { RankingDecisionSchema } from "#lib/schemas";

export default defineAgent({
  description:
    "Score each offer against the company using deterministic compute_match. Receives structured terms only — never offering prose. Sorts by match.",
  model: defineDynamic({
    events: {
      "step.started": () => marketplaceRuntime(),
    },
  }),
  // Only its own tools/: no bash/read_file (a docker sandbox took 20 s+ to open).
  defaultTools: false,
  outputSchema: RankingDecisionSchema,
  experimental: { workflow: { modelCallsPerStep: 6 } },
});
