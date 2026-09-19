import { formatDelta } from "@/lib/xray/format";
import type { Band } from "@/lib/xray/types";
import { ScoreBandBadge } from "./score-band-badge";
import { cn } from "@/lib/utils";

export function ScoreUplift({
  uplift,
  toBand,
  className,
}: {
  uplift: number;
  toBand?: Band;
  className?: string;
}) {
  const positive = uplift >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm tabular-nums",
        positive ? "text-foreground" : "text-destructive",
        className
      )}
    >
      <span className="font-medium">{formatDelta(uplift)}</span>
      {toBand ? (
        <>
          <span className="text-muted-foreground">→</span>
          <ScoreBandBadge band={toBand} />
        </>
      ) : null}
    </span>
  );
}
