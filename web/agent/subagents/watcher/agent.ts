import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Portfolio Health Score watcher. Flags outlook/trend, watch events, or DSCR < 1.2 via evaluate_watch, " +
    "then drafts Spanish Slack/email alerts. Never recalculates the score. Use for «vigila COMP_xxxx» or cartera sweeps.",
  model: "openai/gpt-5.6-luna-fast",
});
