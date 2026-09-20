"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
            color: compare ? "var(--muted-foreground)" : "var(--chart-1)",
          },
          ...(compare
            ? [
                {
                  name: "Después",
                  dimensions: compare,
                  color: "var(--chart-1)",
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

  const config = Object.fromEntries(
    resolved.map((s, i) => [
      `v${i}`,
      { label: s.name, color: s.color ?? "var(--chart-1)" },
    ])
  ) satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-64 w-full"
      initialDimension={{ width: 320, height: 256 }}
    >
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="dim"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {resolved.map((s, i) => (
          <Radar
            key={s.name}
            name={s.name}
            dataKey={`v${i}`}
            stroke={s.color ?? "var(--chart-1)"}
            fill={s.color ?? "var(--chart-1)"}
            fillOpacity={many ? 0.08 : 0.12}
            strokeWidth={many && i === 0 ? 1.5 : 2}
          />
        ))}
        {many ? <ChartLegend content={<ChartLegendContent />} /> : null}
      </RadarChart>
    </ChartContainer>
  );
}
