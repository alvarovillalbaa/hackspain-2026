import { defineEvalConfig } from "eve/evals";
import { CalibrationReporter } from "./lib/report";

export default defineEvalConfig({
  // Deterministic gates only — no LLM judge for calibration.
  maxConcurrency: 2,
  timeoutMs: 300_000,
  reporters: [CalibrationReporter()],
});
