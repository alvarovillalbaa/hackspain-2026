"use client";

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
} from "recharts";
import { alignHistories } from "@/lib/xray/compare";
import { formatMonth } from "@/lib/xray/format";
import type { HistoryPoint, Projection6m } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export type TrajectorySeries = {
  name: string;
  history: HistoryPoint[];
  color?: string;
};

export function ScoreTrajectory({
  history,
  projection,
  series,
  embat = false,
  className,
}: {
  history?: HistoryPoint[];
  projection?: Projection6m;
  series?: TrajectorySeries[];
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

function SingleTrajectory({
  history,
  projection,
  embat = false,
  className,
}: {
  history: HistoryPoint[];
  projection?: Projection6m;
  embat?: boolean;
  className?: string;
}) {
  const last = history[history.length - 1];
  const data = history.map((h) => ({
    month: h.month,
    score: h.score,
    p10: undefined as number | undefined,
    p50: undefined as number | undefined,
    p90: undefined as number | undefined,
  }));

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
    });
  }

  const grid = embat ? "#dce0e6" : "var(--border)";
  const tick = embat ? "#999999" : "var(--muted-foreground)";
  const line = embat ? "#11a8ff" : "var(--foreground)";
  const fill = embat ? "rgba(17,168,255,0.08)" : "var(--foreground)";
  const fan = embat ? "rgba(220,224,230,0.7)" : "var(--muted)";
  const cut = embat ? "#ffffff" : "var(--background)";
  const mid = embat ? "#999999" : "var(--muted-foreground)";
  const tickFont = embat
    ? {
        fill: tick,
        fontSize: 11,
        fontFamily:
          '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : { fill: tick, fontSize: 11 };
  const tooltip = embat
    ? {
        background: "#ffffff",
        border: "1px solid #dce0e6",
        borderRadius: 6,
        fontSize: 12,
        color: "#000000",
        fontFamily:
          '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : {
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 12,
      };

  return (
    <div className={cn("h-56 w-full", className)}>
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
