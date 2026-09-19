import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Decide the ideal financing amount for a company before any product exists. Uses score, cash, debt and invoice facts. Always justifies why not more via ceiling_reason.",
  model: "openai/gpt-5.6-luna-fast",
});
