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
import { formatCompactEuro, formatMonth } from "@/lib/xray/format";
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

  return (
    <section
      className={cn(cardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="tesoreria-chart"
    >
      <header className="border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="tesoreria-chart"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#999]"
        >
          Tesorería
        </h2>
        {recommended ? (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-[#666]">
            Simulación: {TREASURY_LABELS[recommended.kind]}
            {recommended.amount > 0 && recommended.kind !== "factoring"
              ? ` · ${formatCompactEuro(recommended.amount)}`
              : ""}
            {projection
              ? ` · fan 6m p50 ${formatCompactEuro(projection.p50)}`
              : ""}
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-[#999]">
            Caja reconstruida · sin proyección MPC
          </p>
        )}
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        {data.length === 0 ? (
          <p className="px-2 text-[14px] text-[#666]">Sin serie de caja.</p>
        ) : (
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
                tick={{ fill: "#999", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={48}
                tick={{ fill: "#999", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompactEuro(Number(v))}
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
                  formatCompactEuro(Number(value)),
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
                    stroke="#999"
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
        )}
      </div>
      {currency !== "EUR" ? (
        <p className="px-5 pb-2 text-[11px] text-[#999]">
          Serie en {currency}; la simulación MPC solo cubre EUR.
        </p>
      ) : null}
    </section>
  );
}
