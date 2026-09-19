/** Human-readable es-ES labels for Health Score driver signals. */
const SIGNAL_LABELS: Record<string, string> = {
  cash_buffer_days: "Días de colchón de caja",
  overdue_flow_rate_3m: "Tasa de impago a 3 meses",
  dscr_6m: "DSCR a 6 meses",
  net_cash_flow_ratio_3m: "Flujo de caja neto a 3 meses",
};

/** Map a snake_case signal key to a Spanish display label. */
export function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal.replaceAll("_", " ");
}
