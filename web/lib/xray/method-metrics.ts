import { MethodMetricsSchema } from "./schemas";
import type { MethodMetrics } from "./types";

/** Métricas del método publicadas por `xray-export-web`; null si el pack no las lleva o no validan. */
export function parseMethodMetrics(raw: unknown): MethodMetrics | null {
  if (raw == null) return null;
  const parsed = MethodMetricsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
