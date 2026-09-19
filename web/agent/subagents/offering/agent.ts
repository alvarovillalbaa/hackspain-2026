import { defineAgent } from "eve";
import { agentRuntime } from "#lib/model.ts";

export default defineAgent({
  description:
    "Design debt/banking product offers from the issuer side given a target amount. Has no match tools — cannot see which offer will win.",
  ...agentRuntime(),
});
