import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { parseMethodMetrics } from "../../lib/xray/method-metrics";

// Read the optional metrics.json straight from disk: `lib/xray/dataset` pulls in
// `server-only`, which throws when eve evaluates authored modules outside Next.
function readMethodMetrics() {
  try {
    const raw = readFileSync(
      join(process.cwd(), "lib/xray/dataset/metrics.json"),
      "utf8"
    );
    return parseMethodMetrics(JSON.parse(raw));
  } catch {
    return null;
  }
}

export default defineTool({
  description:
    "Published evaluation of the Health Score method (from xray-evals on the reference table): anticipation " +
    "(median lead time in months and the share of events detected early, late, chronic or without history), " +
    "persistence P(red at t+6 | red today) versus the base rate, AUC at 6 months (own event and external cash " +
    "breach), 6-month fan coverage and watch resolution, with the test window. Call it whenever the user asks how " +
    "early the score anticipates, how reliable the fan or the watch is, or how good the score is. Quote the figures " +
    "as returned and never derive months of anticipation from one company's history.",
  inputSchema: z.object({}),
  label: { start: () => "Métricas del método" },
  async execute() {
    const metrics = readMethodMetrics();
    if (!metrics) {
      return { available: false, note: "El pack no lleva métricas del método: no se puede citar anticipación ni cobertura." };
    }
    return {
      available: true,
      ...metrics,
      note: "Cifras de xray-evals sobre la tabla de referencia, con su ventana de prueba; el score es un pronóstico de persistencia, no una probabilidad de impago.",
    };
  },
});
