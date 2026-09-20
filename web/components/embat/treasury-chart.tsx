"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  appendCashProjection,
  type CashHistoryPoint,
} from "@/lib/xray/cash-history";
import { formatCompactEuro, formatMonth } from "@/lib/xray/format";
import type { TreasuryProjection } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const cardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/40";

const TREASURY_LABELS: Record<TreasuryProjection["recommended"]["kind"], string> = {
  none: "No actuar",
  line_draw: "Disponer de la línea",
  line_cover: "Cubrir con la línea",
  line_open: "Abrir línea de crédito",
  factoring: "Anticipo de facturas",
  loan: "Préstamo",
  refinance: "Refinanciar",
};

const chartConfig = {
  cash: { label: "Caja", color: "var(--chart-1)" },
  p50: { label: "Proyección", color: "var(--muted-foreground)" },
  p10: { label: "P10", color: "var(--border)" },
  p90: { label: "P90", color: "var(--border)" },
} satisfies ChartConfig;

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
      <header className="px-5 py-[15px]">
        <h2
          id="tesoreria-chart"
          className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground"
        >
          Tesorería
        </h2>
        {recommended ? (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
            Simulación: {TREASURY_LABELS[recommended.kind]}
            {recommended.amount > 0 && recommended.kind !== "factoring"
              ? ` · ${formatCompactEuro(recommended.amount)}`
              : ""}
            {projection
              ? ` · abanico 6m p50 ${formatCompactEuro(projection.p50)}`
              : ""}
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
            Caja reconstruida · sin proyección MPC
          </p>
        )}
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        {data.length === 0 ? (
          <p className="px-2 text-[14px] text-muted-foreground">Sin serie de caja.</p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full w-full"
            initialDimension={{ width: 400, height: 180 }}
          >
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonth}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={48}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompactEuro(Number(v))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(l) => formatMonth(String(l))}
                    formatter={(value) => formatCompactEuro(Number(value))}
                  />
                }
              />
              {projection ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="p90"
                    stroke="transparent"
                    fill="color-mix(in srgb, var(--border) 70%, transparent)"
                    fillOpacity={0.5}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    stroke="transparent"
                    fill="var(--background)"
                    fillOpacity={1}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p50"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    fill="transparent"
                    connectNulls
                  />
                </>
              ) : null}
              <Line
                type="monotone"
                dataKey="cash"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
                name="Caja"
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </div>
      {currency !== "EUR" ? (
        <p className="px-5 pb-2 text-[11px] text-muted-foreground">
          Serie en {currency}; la simulación MPC solo cubre EUR.
        </p>
      ) : null}
    </section>
  );
}
