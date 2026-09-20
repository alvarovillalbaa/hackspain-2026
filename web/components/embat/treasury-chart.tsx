"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  appendCashProjection,
  type CashHistoryPoint,
} from "@/lib/xray/cash-history";
import { formatCurrency, formatMonth } from "@/lib/xray/format";
import type { TreasuryProjection } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const cardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm";

const TREASURY_LABELS: Record<TreasuryProjection["recommended"]["kind"], string> = {
  none: "No actuar",
  line_draw: "Disponer de la línea",
  line_cover: "Cubrir con la línea",
  line_open: "Abrir línea de crédito",
  factoring: "Factoring",
  loan: "Préstamo",
  refinance: "Refinanciar",
};

/** Currency-aware compact label for the Y axis; the header uses full formatCurrency. */
function compactCurrency(currency: string): (value: number) => string {
  try {
    const fmt = new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return (value) => fmt.format(value);
  } catch {
    return (value) => formatCurrency(value, currency);
  }
}

export function TreasuryChartCard({
  history,
  treasury,
  currency = "EUR",
}: {
  history: CashHistoryPoint[];
  treasury?: TreasuryProjection | null;
  currency?: string;
}) {
  const projection = treasury?.cash_projection_6m ?? null;
  const data = appendCashProjection(history, projection);
  const recommended = treasury?.recommended;

  const todayCash = history.length > 0 ? history[history.length - 1]!.cash : null;
  const summaryParts: string[] = [];
  if (todayCash != null) {
    summaryParts.push(`caja hoy ${formatCurrency(todayCash, currency)}`);
  }
  if (projection) {
    summaryParts.push(
      `abanico 80 % a 6 meses p10 ${formatCurrency(projection.p10, currency)} / p50 ${formatCurrency(
        projection.p50,
        currency
      )} / p90 ${formatCurrency(projection.p90, currency)}`
    );
  }
  const ariaLabel =
    summaryParts.length > 0
      ? `Tesorería. ${summaryParts.join("; ")}.`
      : "Evolución de la tesorería.";
  const axisTick = compactCurrency(currency);

  return (
    <section
      className={cn(cardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="tesoreria-chart"
    >
      <header className="border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="tesoreria-chart"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Tesorería
        </h2>
        {recommended ? (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-[#666]">
            Simulación: {TREASURY_LABELS[recommended.kind]}
            {recommended.amount > 0 && recommended.kind !== "factoring"
              ? ` · ${formatCurrency(recommended.amount, currency)}`
              : ""}
            {projection
              ? ` · Abanico 80 % · mediana a 6 meses ${formatCurrency(projection.p50, currency)}`
              : ""}
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
            Caja reconstruida · sin proyección MPC
          </p>
        )}
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        {data.length === 0 ? (
          <p className="px-2 text-[14px] text-[#666]">Sin serie de caja.</p>
        ) : (
          <>
            <div role="img" aria-label={ariaLabel} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#dce0e6"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fill: "#6b6b6b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={48}
                    tick={{ fill: "#6b6b6b", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => axisTick(Number(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #dce0e6",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                    labelFormatter={(l) => formatMonth(String(l))}
                    formatter={(value, name) => [
                      formatCurrency(Number(value), currency),
                      String(name),
                    ]}
                  />
                  {projection ? (
                    <>
                      <Area
                        type="monotone"
                        dataKey="p90"
                        stroke="transparent"
                        fill="rgba(220,224,230,0.7)"
                        fillOpacity={0.5}
                        connectNulls
                      />
                      <Area
                        type="monotone"
                        dataKey="p10"
                        stroke="transparent"
                        fill="#ffffff"
                        fillOpacity={1}
                        connectNulls
                      />
                      <Area
                        type="monotone"
                        dataKey="p50"
                        stroke="#6b6b6b"
                        strokeDasharray="4 4"
                        fill="transparent"
                        connectNulls
                      />
                    </>
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="cash"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    name="Caja"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Tesorería · caja y abanico a 6 meses</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">Caja</th>
                  <th scope="col">p10</th>
                  <th scope="col">p50</th>
                  <th scope="col">p90</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.month}>
                    <th scope="row">{formatMonth(row.month)}</th>
                    <td>{row.cash != null ? formatCurrency(row.cash, currency) : "—"}</td>
                    <td>{row.p10 != null ? formatCurrency(row.p10, currency) : "—"}</td>
                    <td>{row.p50 != null ? formatCurrency(row.p50, currency) : "—"}</td>
                    <td>{row.p90 != null ? formatCurrency(row.p90, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      {currency !== "EUR" ? (
        <p className="px-5 pb-2 text-[11px] text-[#6b6b6b]">
          Serie en {currency}; la simulación MPC solo cubre EUR.
        </p>
      ) : null}
    </section>
  );
}
