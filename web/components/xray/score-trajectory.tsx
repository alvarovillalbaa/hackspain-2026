"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/xray/format";
import type { HistoryPoint, Projection6m } from "@/lib/xray/types";

export function ScoreTrajectory({
  history,
  projection,
}: {
  history: HistoryPoint[];
  projection: Projection6m;
}) {
  const last = history[history.length - 1];
  const data = history.map((h) => ({
    month: h.month,
    score: h.score,
    p10: undefined as number | undefined,
    p50: undefined as number | undefined,
    p90: undefined as number | undefined,
  }));

  if (last) {
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

  return (
    <div className="space-y-2">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            <Area
              type="monotone"
              dataKey="p90"
              stroke="transparent"
              fill="var(--muted)"
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
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--foreground)"
              fill="var(--foreground)"
              fillOpacity={0.06}
              strokeWidth={2}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          Histórico · Forecast 6m: p10 {projection.p10.toFixed(1)} · p50{" "}
          {projection.p50.toFixed(1)} · p90 {projection.p90.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
