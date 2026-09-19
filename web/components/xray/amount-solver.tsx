"use client";

import { Slider } from "@/components/ui/slider";
import { formatCurrency } from "@/lib/xray/format";
import { ScoreUplift } from "./score-uplift";
import { ReasoningHint } from "./reasoning-hint";
import type { Band } from "@/lib/xray/types";

export function AmountSolver({
  value,
  min,
  max,
  uplift,
  from,
  to,
  toBand,
  currency = "EUR",
  reasoning,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  uplift: number;
  from?: number;
  to?: number;
  toBand?: Band;
  currency?: string;
  reasoning?: string | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-1.5">
          <div>
            <div className="text-xs text-muted-foreground">Importe ideal</div>
            <div className="font-mono text-lg tabular-nums">
              {formatCurrency(value, currency)}
            </div>
          </div>
          <ReasoningHint text={reasoning} />
        </div>
        <ScoreUplift uplift={uplift} from={from} to={to} toBand={toBand} />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={Math.max(5_000, Math.round((max - min) / 40))}
        onValueChange={(v) => {
          const arr = v as number[];
          const n = arr[0];
          if (typeof n === "number") onChange(n);
        }}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{formatCurrency(min, currency)}</span>
        <span>{formatCurrency(max, currency)}</span>
      </div>
    </div>
  );
}
