import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Score each offer against the company using deterministic compute_match. Receives structured terms only — never offering prose. Sorts by match.",
  model: "openai/gpt-5.6-luna-fast",
});
