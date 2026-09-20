/**
 * Reconstruct month-end cash backwards from the as-of balance using monthly net.
 * Same logic as agent/lib/data.ts working-capital rebuild.
 */
import type { MonthlyCash } from "./dataset/types";
import { appendProjectionFan } from "./projection-fan";

export interface CashHistoryPoint {
  month: string;
  cash: number;
  inflow: number;
  outflow: number;
  net: number;
}

export type CashChartPoint = {
  month: string;
  cash?: number;
  inflow: number;
  outflow: number;
  net: number;
  p10?: number;
  p50?: number;
  p90?: number;
};

export function rebuildCashHistory(
  cashBalance: number,
  cashSeries: MonthlyCash[]
): CashHistoryPoint[] {
  let cashEnd = cashBalance;
  // Newest last in facts; walk newest → oldest subtracting net.
  const newestFirst = [...cashSeries].sort((a, b) =>
    a.month < b.month ? 1 : a.month > b.month ? -1 : 0
  );
  const rebuilt: CashHistoryPoint[] = [];
  for (const m of newestFirst) {
    rebuilt.push({
      month: m.month,
      cash: cashEnd,
      inflow: m.inflow,
      outflow: m.outflow,
      net: m.net,
    });
    cashEnd -= m.net;
  }
  rebuilt.reverse();
  return rebuilt;
}

/** Add a 6m projection fan anchored on the last history cash. */
export function appendCashProjection(
  history: CashHistoryPoint[],
  projection: { p10: number; p50: number; p90: number } | null | undefined
): CashChartPoint[] {
  if (!projection || history.length === 0) {
    return history.map((h) => ({ ...h }));
  }
  const last = history[history.length - 1]!;
  const fanned = appendProjectionFan(history, projection, last.cash);
  return fanned.map((row, i) => {
    if (i < history.length) return row as CashChartPoint;
    return {
      month: row.month,
      inflow: 0,
      outflow: 0,
      net: 0,
      p10: row.p10,
      p50: row.p50,
      p90: row.p90,
    };
  });
}
