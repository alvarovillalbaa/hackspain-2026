/** Human-readable es-ES labels and polarity for Health Score signals. */

export type SignalKey =
  | "cash_buffer_days"
  | "overdue_flow_rate_3m"
  | "dscr_6m"
  | "net_cash_flow_ratio_3m";

/** high = higher value is worse; low = lower value is worse. */
export type SignalPolarity = "high" | "low";

const SIGNAL_LABELS: Record<string, string> = {
  cash_buffer_days: "Días de colchón de caja",
  overdue_flow_rate_3m: "Tasa de impago a 3 meses",
  dscr_6m: "DSCR a 6 meses",
  net_cash_flow_ratio_3m: "Flujo de caja neto a 3 meses",
};

const SIGNAL_POLARITY: Record<string, SignalPolarity> = {
  cash_buffer_days: "low",
  overdue_flow_rate_3m: "high",
  dscr_6m: "low",
  net_cash_flow_ratio_3m: "low",
};

const SIGNAL_BLURBS: Record<string, string> = {
  cash_buffer_days:
    "Días de outflow que cubre el saldo mínimo. Más es mejor.",
  overdue_flow_rate_3m:
    "Impagado sobre emitido a 3 meses. Menos es mejor.",
  dscr_6m:
    "Cobertura del servicio de deuda con inflows operativos a 6 meses. Más es mejor.",
  net_cash_flow_ratio_3m:
    "Flujo neto sobre outflows a 3 meses. Más es mejor.",
};

/** Map a snake_case signal key to a Spanish display label. */
export function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal.replaceAll("_", " ");
}

export function signalPolarity(signal: string): SignalPolarity {
  return SIGNAL_POLARITY[signal] ?? "low";
}

export function signalBlurb(signal: string): string {
  return (
    SIGNAL_BLURBS[signal] ??
    `${signalLabel(signal)}. Rango percentil ≤ 0,20 marca cola roja.`
  );
}

/** Rank ≤ 0.20 is the red tail (same cut as the Health Score rules). */
export function isRedRank(rank: number | null | undefined): boolean {
  return rank != null && Number.isFinite(rank) && rank <= 0.2;
}

/** Driver delta: positive = good for low-polarity signals; inverted for high. */
export function driverIsGood(signal: string, delta: number): boolean {
  const polarity = signalPolarity(signal);
  return polarity === "high" ? delta < 0 : delta > 0;
}
