import type { ActionKind } from "./types";

const percentFmt = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 1,
});

const numberFmt = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 1,
});

const currencyFmtCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, precise: boolean): Intl.NumberFormat {
  const key = `${currency}:${precise ? 2 : 0}`;
  const hit = currencyFmtCache.get(key);
  if (hit) return hit;
  const fmt = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: precise ? 2 : 0,
  });
  currencyFmtCache.set(key, fmt);
  return fmt;
}

export function formatCurrency(
  value: number,
  currency = "EUR",
  precise = false
): string {
  try {
    return currencyFormatter(currency, precise).format(value);
  } catch {
    return `${numberFmt.format(value)} ${currency}`;
  }
}

/** Compact euro amounts as in the Embat table: `100k€`, `10M€`. */
export function formatCompactEuro(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 1_000_000)}M€`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k€`;
  return `${sign}${Math.round(abs)}€`;
}

/** `"2026-08"` → `"31/08/2026"` (último día del mes, es-ES). */
export function formatSlashDateFromMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(last).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function formatPercent(value: number): string {
  return percentFmt.format(value);
}

/** Compact rate for the Compañías table: `6,2%`, `12%`. */
export function formatRatePct(rate: number | null): string {
  if (rate == null) return "—";
  const pct = rate * 100;
  const formatted = new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 1,
  }).format(pct);
  return `${formatted}%`;
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

/** Compact signed number as in the Compañía cards: `+ 1,1`, `− 1,7`. */
export function formatSignedNumber(value: number): string {
  const abs = numberFmt.format(Math.abs(value));
  if (value > 0) return `+ ${abs}`;
  if (value < 0) return `− ${abs}`;
  return abs;
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
