"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Dimensions } from "@/lib/xray/types";

const LABELS: Record<keyof Dimensions, string> = {
  liquidity: "Liquidez",
  collections: "Cobros",
  payments: "Pagos",
  debt: "Deuda",
  activity: "Actividad",
};

export function DimensionRadar({ dimensions }: { dimensions: Dimensions }) {
  const data = (Object.keys(LABELS) as (keyof Dimensions)[]).map((key) => ({
    dim: LABELS[key],
    value: Math.round(dimensions[key] * 100),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="dim"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Radar
            dataKey="value"
            stroke="var(--foreground)"
            fill="var(--foreground)"
            fillOpacity={0.12}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
