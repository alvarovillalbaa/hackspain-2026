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
  variant = "default",
}: {
  score: number;
  band: Band;
  className?: string;
  color?: string;
  variant?: "default" | "embat";
}) {
  const meta = bandMeta(band);
  const data = [{ name: "score", value: score, fill: color }];
  const embat = variant === "embat";

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div className={cn(embat ? "h-[192px] w-[192px]" : "h-48 w-48")}>
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
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              background={{ fill: embat ? "#dce0e6" : "var(--muted)" }}
              dataKey="value"
              cornerRadius={8}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {embat ? (
          <span
            className="font-embat -translate-y-[6px] text-[40px] leading-none font-medium tabular-nums tracking-[-0.4px]"
            style={{ color }}
          >
            {Math.round(score)}
          </span>
        ) : (
          <>
            <span className="font-heading text-4xl font-semibold tabular-nums tracking-tight">
              {score.toFixed(1)}
            </span>
            <span className="mt-1 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              {meta.label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
