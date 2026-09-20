"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Scatter,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { alignHistories } from "@/lib/xray/compare";
import { formatMonth, formatSignedNumber } from "@/lib/xray/format";
import { appendProjectionFan } from "@/lib/xray/projection-fan";
import { driverIsGood, signalLabel } from "@/lib/xray/signal-labels";
import type { Driver, HistoryPoint, Projection6m } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const trajectoryConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
  p50: { label: "Mediana", color: "var(--muted-foreground)" },
  p10: { label: "P10", color: "var(--border)" },
  p90: { label: "P90", color: "var(--border)" },
} satisfies ChartConfig;

/** `"2026-08"` → `"ago 26"`, so dense X axes do not collide. */
function shortMonth(month: string): string {
  const label = formatMonth(month);
  const match = label.match(/^(\S+)\s+(\d{4})$/);
  return match ? `${match[1]} ${match[2].slice(2)}` : label;
}

export type TrajectorySeries = {
  name: string;
  history: HistoryPoint[];
  color?: string;
};

export type SignalDotMonth = {
  month: string;
  score: number;
  drivers: Driver[];
};

export function ScoreTrajectory({
  history,
  projection,
  series,
  signalDots,
  embat = false,
  className,
}: {
  history?: HistoryPoint[];
  projection?: Projection6m;
  series?: TrajectorySeries[];
  /** Clickable driver months on the score line. */
  signalDots?: SignalDotMonth[];
  embat?: boolean;
  className?: string;
}) {
  if (series && series.length > 0) {
    return <CompareTrajectory series={series} className={className} />;
  }
  return (
    <SingleTrajectory
      history={history ?? []}
      projection={projection}
      signalDots={signalDots}
      embat={embat}
      className={className}
    />
  );
}

function CompareTrajectory({
  series,
  className,
}: {
  series: TrajectorySeries[];
  className?: string;
}) {
  const keyed = series.map((s, i) => ({
    key: `s${i}`,
    name: s.name,
    history: s.history,
    color: s.color ?? "var(--foreground)",
  }));
  const data = alignHistories(keyed);

  return (
    <ChartContainer
      config={Object.fromEntries(
        keyed.map((s) => [s.key, { label: s.name, color: s.color }])
      )}
      className={cn("aspect-auto h-56 w-full", className)}
      initialDimension={{ width: 480, height: 224 }}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            width={32}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(l) => formatMonth(String(l))} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
          />
          {keyed.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </ComposedChart>
    </ChartContainer>
  );
}

function DotMarker({
  cx,
  cy,
  payload,
  onSelect,
}: {
  cx?: number;
  cy?: number;
  payload?: { month?: string; drivers?: Driver[]; score?: number };
  onSelect?: (month: string, drivers: Driver[]) => void;
}) {
  if (cx == null || cy == null || !payload?.drivers?.length) return null;
  const good = payload.drivers.every((d) => driverIsGood(d.signal, d.delta));
  const bad = payload.drivers.every((d) => !driverIsGood(d.signal, d.delta));
  const fill = good ? "var(--positive)" : bad ? "var(--destructive)" : "var(--warning)";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(payload.month!, payload.drivers!);
      }}
    />
  );
}

function SingleTrajectory({
  history,
  projection,
  signalDots,
  embat = false,
  className,
}: {
  history: HistoryPoint[];
  projection?: Projection6m;
  signalDots?: SignalDotMonth[];
  embat?: boolean;
  className?: string;
}) {
  const [openDot, setOpenDot] = useState<{
    month: string;
    drivers: Driver[];
  } | null>(null);

  const dotsByMonth = new Map(
    (signalDots ?? []).map((d) => [d.month, d] as const)
  );

  const last = history[history.length - 1];
  const base = history.map((h) => {
    const dot = dotsByMonth.get(h.month);
    return {
      month: h.month,
      score: h.score,
      signalScore: dot ? h.score : undefined,
      drivers: dot?.drivers,
    };
  });
  const data = last
    ? appendProjectionFan(base, projection, last.score).map((row, i) =>
        i < base.length
          ? row
          : {
              ...row,
              score: undefined as unknown as number,
              signalScore: undefined,
              drivers: undefined,
            }
      )
    : base;

  const grid = "var(--border)";
  const tick = "var(--muted-foreground)";
  const line = embat ? "var(--primary)" : "var(--chart-1)";
  const fill = embat
    ? "color-mix(in srgb, var(--primary) 12%, transparent)"
    : "color-mix(in srgb, var(--chart-1) 8%, transparent)";
  const fan = "color-mix(in srgb, var(--border) 70%, transparent)";
  const cut = "var(--background)";
  const mid = "var(--muted-foreground)";
  const tickFont = {
    fill: tick,
    fontSize: 11,
    ...(embat
      ? {
          fontFamily:
            '"Inter Variable", var(--font-inter-variable), sans-serif',
        }
      : {}),
  };

  const chart = (
    <div className={cn("relative h-56 w-full", className)}>
      <ChartContainer
        config={trajectoryConfig}
        className="aspect-auto h-full w-full"
        initialDimension={{ width: 480, height: 224 }}
      >
        <ComposedChart
          data={data}
          margin={{ top: 8, right: embat ? 20 : 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={embat ? shortMonth : formatMonth}
            tick={tickFont}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={embat ? 14 : 5}
          />
          <YAxis
            domain={[0, 100]}
            width={32}
            tick={tickFont}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(l) => formatMonth(String(l))}
              />
            }
          />
          {projection ? (
            <>
              <Area
                type="monotone"
                dataKey="p90"
                stroke="transparent"
                fill={fan}
                fillOpacity={0.5}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="p10"
                stroke="transparent"
                fill={cut}
                fillOpacity={1}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="p50"
                stroke={mid}
                strokeDasharray="4 4"
                fill="transparent"
                connectNulls
              />
            </>
          ) : null}
          <Area
            type="monotone"
            dataKey="score"
            stroke={line}
            fill={fill}
            fillOpacity={embat ? 1 : 0.06}
            strokeWidth={2}
            connectNulls
          />
          {signalDots && signalDots.length > 0 ? (
            <Scatter
              dataKey="signalScore"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(props: any) => (
                <DotMarker
                  cx={props.cx}
                  cy={props.cy}
                  payload={props.payload}
                  onSelect={(month, drivers) => setOpenDot({ month, drivers })}
                />
              )}
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>

      {openDot ? (
        <Popover open onOpenChange={(o) => !o && setOpenDot(null)}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="absolute inset-0 z-10 cursor-default opacity-0"
                aria-label="Cerrar señal"
              />
            }
          />
          <PopoverContent
            align="center"
            side="top"
            className="z-50 w-[280px] rounded-xl bg-popover p-3 text-[13px] shadow-sm ring-1 ring-border/40"
          >
            <p className="mb-2 font-medium text-foreground">
              Señales · {formatMonth(openDot.month)}
            </p>
            <ul className="flex flex-col gap-2">
              {openDot.drivers.map((d) => {
                const good = driverIsGood(d.signal, d.delta);
                return (
                  <li
                    key={`${d.signal}-${d.since}`}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-muted-foreground">
                        {signalLabel(d.signal)}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px]",
                          good ? "text-positive" : "text-destructive"
                        )}
                      >
                        {good ? "Buena" : "Mala"} para el índice
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-medium",
                        good ? "text-positive" : "text-destructive"
                      )}
                    >
                      {formatSignedNumber(d.delta)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );

  if (embat) return chart;

  return (
    <div className="space-y-2">
      {chart}
      {projection ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            Histórico · Previsión 6m: p10 {projection.p10.toFixed(1)} · p50{" "}
            {projection.p50.toFixed(1)} · p90 {projection.p90.toFixed(1)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
