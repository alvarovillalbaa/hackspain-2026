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

export function DimensionRadar({
  dimensions,
  compare,
}: {
  dimensions: Dimensions;
  /** Optional second series (e.g. after action). */
  compare?: Dimensions;
}) {
  const hasCompare = compare != null;
  const data = (Object.keys(LABELS) as (keyof Dimensions)[]).map((key) => ({
    dim: LABELS[key],
    value: Math.round(dimensions[key] * 100),
    compare: hasCompare ? Math.round(compare[key] * 100) : undefined,
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
            name="Antes"
            dataKey="value"
            stroke="var(--muted-foreground)"
            fill="var(--muted-foreground)"
            fillOpacity={hasCompare ? 0.08 : 0.12}
            strokeWidth={hasCompare ? 1 : 2}
          />
          {hasCompare ? (
            <>
              <Radar
                name="Después"
                dataKey="compare"
                stroke="var(--foreground)"
                fill="var(--foreground)"
                fillOpacity={0.14}
                strokeWidth={2}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 11,
                  color: "var(--muted-foreground)",
                }}
              />
            </>
          ) : null}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
