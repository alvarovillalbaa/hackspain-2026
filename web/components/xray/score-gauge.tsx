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
import { ReasoningHint } from "./reasoning-hint";

export function ScoreGauge({
  score,
  band,
  label,
  reasoning,
  size = "md",
  className,
  color = "var(--foreground)",
  variant = "default",
}: {
  score: number;
  band?: Band;
  /** Override center label (e.g. dimension name). */
  label?: string;
  reasoning?: string | null;
  size?: "sm" | "md";
  className?: string;
  color?: string;
  variant?: "default" | "embat";
}) {
  const meta = band ? bandMeta(band) : null;
  const data = [{ name: "score", value: score, fill: color }];
  const embat = variant === "embat";
  const box = embat
    ? "h-[192px] w-[192px]"
    : size === "sm"
      ? "h-28 w-28"
      : "h-48 w-48";
  const scoreClass =
    size === "sm"
      ? "font-heading text-xl font-semibold tabular-nums tracking-tight"
      : "font-heading text-4xl font-semibold tabular-nums tracking-tight";

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {reasoning ? (
        <div className="absolute top-0 right-0 z-10">
          <ReasoningHint text={reasoning} />
        </div>
      ) : null}
      <div className={box}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="72%"
            outerRadius="100%"
            barSize={size === "sm" && !embat ? 8 : 12}
            data={data}
            startAngle={220}
            endAngle={-40}
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
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-2">
        {embat ? (
          <span
            className="font-embat text-[40px] font-medium tabular-nums tracking-[-0.4px]"
            style={{ color }}
          >
            {Math.round(score)}
          </span>
        ) : (
          <>
            <span className={scoreClass}>
              {size === "sm" ? score.toFixed(0) : score.toFixed(1)}
            </span>
            <span className="mt-0.5 max-w-[90%] truncate text-center font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {label ?? meta?.label ?? ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
