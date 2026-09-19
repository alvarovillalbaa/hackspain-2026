/**
 * Reconstruct month-end cash backwards from the as-of balance using monthly net.
 * Same logic as agent/lib/data.ts working-capital rebuild.
 */
import type { MonthlyCash } from "./dataset/types";

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

/** Add a 6m projection fan anchored on the last history point. */
export function appendCashProjection(
  history: CashHistoryPoint[],
  projection: { p10: number; p50: number; p90: number } | null | undefined
): CashChartPoint[] {
  const data: CashChartPoint[] = history.map((h) => ({ ...h }));
  if (!projection || data.length === 0) return data;
  const last = data[data.length - 1]!;
  const [y, m] = last.month.split("-").map(Number);
  let yy = y!;
  let mm = m! + 6;
  while (mm > 12) {
    mm -= 12;
    yy += 1;
  }
  const future = `${yy}-${String(mm).padStart(2, "0")}`;
  data[data.length - 1] = {
    ...last,
    p10: projection.p10,
    p50: projection.p50,
    p90: projection.p90,
  };
  data.push({
    month: future,
    inflow: 0,
    outflow: 0,
    net: 0,
    p10: projection.p10,
    p50: projection.p50,
    p90: projection.p90,
  });
  return data;
}
