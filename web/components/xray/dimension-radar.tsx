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

const DIMENSION_KEYS = Object.keys(LABELS) as (keyof Dimensions)[];

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
  const data = DIMENSION_KEYS.map((key) => {
    const row: Record<string, string | number> = { dim: LABELS[key] };
    resolved.forEach((s, i) => {
      row[`v${i}`] = Math.round(s.dimensions[key] * 100);
    });
    return row;
  });

  const summary = resolved
    .map(
      (s) =>
        `${s.name}: ${DIMENSION_KEYS.map(
          (key) => `${LABELS[key]} ${Math.round(s.dimensions[key] * 100)}`
        ).join(", ")}`
    )
    .join("; ");
  const ariaLabel = resolved.length
    ? `Radar de dimensiones 0–100. ${summary}.`
    : "Radar de dimensiones 0–100.";

  return (
    <div className="h-64 w-full">
      <div role="img" aria-label={ariaLabel} className="h-full w-full">
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
          {DIMENSION_KEYS.map((key) => (
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
