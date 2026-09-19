"use client";

import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import type { MatchBreakdown } from "@/lib/xray/types";
import { formatPercent } from "@/lib/xray/format";

export function MatchBreakdownBars({ breakdown }: { breakdown: MatchBreakdown }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="font-mono text-lg tabular-nums">
            {formatPercent(breakdown.client_fit)}
          </div>
          <div className="text-[11px] text-muted-foreground">Cliente</div>
        </div>
        <div>
          <div className="font-heading text-xl font-semibold tabular-nums">
            {formatPercent(breakdown.match)}
          </div>
          <div className="text-[11px] text-muted-foreground">Match</div>
        </div>
        <div>
          <div className="font-mono text-lg tabular-nums">
            {formatPercent(breakdown.issuer_appetite)}
          </div>
          <div className="text-[11px] text-muted-foreground">Emisor</div>
        </div>
      </div>
      <div className="space-y-2">
        {breakdown.factors.map((f) => (
          <Progress key={`${f.side}-${f.label}`} value={f.score * 100}>
            <ProgressLabel className="text-xs">
              <span className="text-muted-foreground">
                {f.side === "client" ? "C" : "E"} ·{" "}
              </span>
              {f.label}
            </ProgressLabel>
            <ProgressValue />
          </Progress>
        ))}
      </div>
    </div>
  );
}
