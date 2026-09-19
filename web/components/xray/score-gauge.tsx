"use client";

import {
  RadialBar,
  RadialBarChart,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import { bandMeta } from "@/lib/xray/bands";
import type { Band } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export function ScoreGauge({
  score,
  band,
  className,
  color = "var(--foreground)",
}: {
  score: number;
  band: Band;
  className?: string;
  color?: string;
}) {
  const meta = bandMeta(band);
  const data = [{ name: "score", value: score, fill: color }];

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className="h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="72%"
            outerRadius="100%"
            barSize={12}
            data={data}
            startAngle={220}
            endAngle={-40}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: "var(--muted)" }}
              dataKey="value"
              cornerRadius={8}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="font-heading text-4xl font-semibold tabular-nums tracking-tight">
          {score.toFixed(1)}
        </span>
        <span className="mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
          {meta.label}
        </span>
      </div>
    </div>
  );
}
