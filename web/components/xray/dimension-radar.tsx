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

  const dimensionKeys = Object.keys(LABELS) as (keyof Dimensions)[];
  const summary = resolved
    .map(
      (s) =>
        `${s.name}: ${dimensionKeys
          .map((key) => `${LABELS[key]} ${Math.round(s.dimensions[key] * 100)}`)
          .join(", ")}`
    )
    .join("; ");
  const ariaLabel = resolved.length
    ? `Radar de dimensiones 0–100. ${summary}.`
    : "Radar de dimensiones 0–100.";

  return (
    <div className="h-64 w-full">
      <div role="img" aria-label={ariaLabel} className="h-full w-full">
        <ChartContainer
          config={config}
          className="aspect-auto h-full w-full"
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
      </div>
      <table className="sr-only">
        <caption>Dimensiones del score (0–100)</caption>
        <thead>
          <tr>
            <th scope="col">Dimensión</th>
            {resolved.map((s) => (
              <th key={s.name} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dimensionKeys.map((key) => (
            <tr key={key}>
              <th scope="row">{LABELS[key]}</th>
              {resolved.map((s) => (
                <td key={s.name}>{Math.round(s.dimensions[key] * 100)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
