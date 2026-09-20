import { formatDelta } from "@/lib/xray/format";
import { cn } from "@/lib/utils";

export function ScoreUplift({
  uplift,
  from,
  to,
  className,
}: {
  uplift: number;
  from?: number;
  to?: number;
  /** @deprecated band hidden from UI */
  toBand?: string;
  className?: string;
}) {
  const positive = uplift >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm tabular-nums",
        positive ? "text-foreground" : "text-destructive",
        className
      )}
    >
      {from != null && to != null ? (
        <span>
          {from.toLocaleString("es-ES", { maximumFractionDigits: 1 })} →{" "}
          {to.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
        </span>
      ) : to != null ? (
        <span>
          → {to.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
        </span>
      ) : null}
      <span className="font-medium">{formatDelta(uplift)}</span>
    </span>
  );
}
