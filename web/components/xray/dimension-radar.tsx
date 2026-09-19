"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Dimensions } from "@/lib/xray/types";

const LABELS: Record<keyof Dimensions, string> = {
  liquidity: "Liquidez",
  collections: "Cobros",
  payments: "Pagos",
  debt: "Deuda",
  activity: "Actividad",
};

export type RadarSeries = {
  name: string;
  dimensions: Dimensions;
  color?: string;
};

export function DimensionRadar({
  dimensions,
  compare,
  series,
}: {
  dimensions?: Dimensions;
  compare?: Dimensions;
  series?: RadarSeries[];
}) {
  const resolved: RadarSeries[] =
    series ??
    (dimensions
      ? [
          {
            name: compare ? "Antes" : "Actual",
            dimensions,
            color: compare ? "var(--muted-foreground)" : "var(--foreground)",
          },
          ...(compare
            ? [
                {
                  name: "Después",
                  dimensions: compare,
                  color: "var(--foreground)",
                },
              ]
            : []),
        ]
      : []);

  const many = resolved.length > 1;
  const data = (Object.keys(LABELS) as (keyof Dimensions)[]).map((key) => {
    const row: Record<string, string | number> = { dim: LABELS[key] };
    resolved.forEach((s, i) => {
      row[`v${i}`] = Math.round(s.dimensions[key] * 100);
    });
    return row;
  });

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="dim"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          {resolved.map((s, i) => (
            <Radar
              key={s.name}
              name={s.name}
              dataKey={`v${i}`}
              stroke={s.color ?? "var(--foreground)"}
              fill={s.color ?? "var(--foreground)"}
              fillOpacity={many ? 0.08 : 0.12}
              strokeWidth={many && i === 0 ? 1.5 : 2}
            />
          ))}
          {many ? (
            <Legend
              wrapperStyle={{
                fontSize: 11,
                color: "var(--muted-foreground)",
              }}
            />
          ) : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
