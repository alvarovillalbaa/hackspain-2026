import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Design debt/banking product offers from the issuer side given a target amount. Has no match tools — cannot see which offer will win.",
  model: "openai/gpt-5.6-luna-fast",
});
