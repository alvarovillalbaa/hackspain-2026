"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { alignHistories } from "@/lib/xray/compare";
import { formatMonth, formatSignedNumber } from "@/lib/xray/format";
import { driverIsGood, signalLabel } from "@/lib/xray/signal-labels";
import type { Driver, HistoryPoint, Projection6m } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

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
    <div className={cn("h-56 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
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
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(l) => formatMonth(String(l))}
          />
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
      </ResponsiveContainer>
    </div>
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
  const fill = good ? "#00a14e" : bad ? "#e61847" : "#ef8000";
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
  const data = history.map((h) => {
    const dot = dotsByMonth.get(h.month);
    return {
      month: h.month,
      score: h.score,
      p10: undefined as number | undefined,
      p50: undefined as number | undefined,
      p90: undefined as number | undefined,
      signalScore: dot ? h.score : undefined,
      drivers: dot?.drivers,
    };
  });

  if (last && projection) {
    const [y, m] = last.month.split("-").map(Number);
    let yy = y!;
    let mm = m! + 6;
    while (mm > 12) {
      mm -= 12;
      yy += 1;
    }
    const future = `${yy}-${String(mm).padStart(2, "0")}`;
    data[data.length - 1] = {
      ...data[data.length - 1]!,
      p10: projection.p10,
      p50: projection.p50,
      p90: projection.p90,
    };
    data.push({
      month: future,
      score: undefined as unknown as number,
      p10: projection.p10,
      p50: projection.p50,
      p90: projection.p90,
      signalScore: undefined,
      drivers: undefined,
    });
  }

  const grid = embat ? "#dce0e6" : "var(--border)";
  const tick = embat ? "#999999" : "var(--muted-foreground)";
  const line = embat ? "var(--primary)" : "var(--foreground)";
  const fill = embat ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--foreground)";
  const fan = embat ? "rgba(220,224,230,0.7)" : "var(--muted)";
  const cut = embat ? "#ffffff" : "var(--background)";
  const mid = embat ? "#999999" : "var(--muted-foreground)";
  const tickFont = embat
    ? {
        fill: tick,
        fontSize: 11,
        fontFamily: '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : { fill: tick, fontSize: 11 };
  const tooltip = embat
    ? {
        background: "#ffffff",
        border: "1px solid #dce0e6",
        borderRadius: 6,
        fontSize: 12,
        color: "#000000",
        fontFamily: '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : {
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 12,
      };

  const chart = (
    <div className={cn("relative h-56 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={tickFont}
            axisLine={false}
            tickLine={false}
            interval={embat ? 0 : "preserveStartEnd"}
          />
          <YAxis
            domain={[0, 100]}
            width={32}
            tick={tickFont}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltip}
            labelFormatter={(l) => formatMonth(String(l))}
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
      </ResponsiveContainer>

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
            className="z-50 w-[280px] rounded-xl border border-[#dce0e6] bg-white p-3 text-[13px] shadow-sm"
          >
            <p className="mb-2 font-medium text-black">
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
                      <span className="font-medium text-[#666]">
                        {signalLabel(d.signal)}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px]",
                          good ? "text-[#00a14e]" : "text-[#e61847]"
                        )}
                      >
                        {good ? "Buena" : "Mala"} para el índice
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-medium",
                        good ? "text-[#00a14e]" : "text-[#e61847]"
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
            Histórico · Forecast 6m: p10 {projection.p10.toFixed(1)} · p50{" "}
            {projection.p50.toFixed(1)} · p90 {projection.p90.toFixed(1)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
