import { defineAgent, defineDynamic } from "eve";
import { rootRuntime } from "#lib/model";

export default defineAgent({
  // Live LanguageModel objects may only be returned from `step.started`.
  model: defineDynamic({
    events: {
      "step.started": (_event, ctx) => rootRuntime(ctx.messages),
    },
  }),
});
