import type { ActionKind } from "./types";

const currencyFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const currencyPreciseFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const percentFmt = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 1,
});

const numberFmt = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number, precise = false): string {
  return (precise ? currencyPreciseFmt : currencyFmt).format(value);
}

export function formatPercent(value: number): string {
  return percentFmt.format(value);
}

export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

/** Month string "YYYY-MM" → "oct 2024". */
export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("es-ES", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDelta(value: number, suffix = " pts"): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${numberFmt.format(value)}${suffix}`;
}

export function formatBps(bps: number): string {
  return `${numberFmt.format(bps)} bps`;
}

export function formatRate(annual: number): string {
  return formatPercent(annual);
}

export function actionKindLabel(kind: ActionKind): string {
  const map: Record<ActionKind, string> = {
    refinance: "Refinanciación",
    new_debt: "Nueva deuda",
    amortize: "Amortización",
    extend_line: "Línea de crédito",
    factoring: "Factoring",
    confirming: "Confirming",
  };
  return map[kind];
}
