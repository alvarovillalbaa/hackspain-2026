"use client";

import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/xray/format";
import type { Band } from "@/lib/xray/types";
import { ScoreBandBadge } from "./score-band-badge";

/**
 * Stacked 0–100 bar: current Health Score + uplift segment in a second color.
 */
export function ScoreDeltaBar({
  current,
  uplift,
  toBand,
  className,
}: {
  current: number;
  uplift: number;
  toBand?: Band;
  className?: string;
}) {
  const base = Math.max(0, Math.min(100, current));
  const add = Math.max(0, Math.min(100 - base, uplift));
  const basePct = base;
  const addPct = add;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Score ${current.toFixed(1)}, uplift ${formatDelta(uplift)}`}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${basePct}%` }}
        />
        {addPct > 0 ? (
          <div
            className="absolute inset-y-0 bg-emerald-500"
            style={{ left: `${basePct}%`, width: `${addPct}%` }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-mono tabular-nums text-muted-foreground">
          {current.toFixed(1)}
          {uplift !== 0 ? (
            <>
              {" "}
              <span
                className={cn(
                  "font-medium",
                  uplift > 0 ? "text-emerald-600" : "text-red-600"
                )}
              >
                {formatDelta(uplift)}
              </span>
            </>
          ) : null}
        </span>
        {toBand ? <ScoreBandBadge band={toBand} /> : null}
      </div>
    </div>
  );
}
