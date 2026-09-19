"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DimensionRadar } from "@/components/xray/dimension-radar";
import { formatNumber } from "@/lib/xray/format";
import {
  isRedRank,
  signalBlurb,
  signalLabel,
  signalPolarity,
} from "@/lib/xray/signal-labels";
import type { ScoreSnapshot } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const SIGNAL_KEYS = [
  "cash_buffer_days",
  "overdue_flow_rate_3m",
  "dscr_6m",
  "net_cash_flow_ratio_3m",
] as const;

function formatSignalValue(key: string, value: number | null): string {
  if (value == null) return "—";
  if (key === "overdue_flow_rate_3m" || key === "net_cash_flow_ratio_3m") {
    return `${(value * 100).toFixed(1)} %`;
  }
  if (key === "dscr_6m") return formatNumber(value);
  return formatNumber(value);
}

export function SignalsDialog({
  open,
  onOpenChange,
  snapshot,
  ranks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ScoreSnapshot;
  ranks?: ScoreSnapshot extends never
    ? never
    : {
        cash_buffer_days?: number;
        overdue_flow_rate_3m?: number;
        dscr_6m?: number;
        net_cash_flow_ratio_3m?: number;
      };
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Señales del índice</DialogTitle>
          <DialogDescription>
            {snapshot.n_signals} señales · {snapshot.n_red} en rojo
            {snapshot.n_red >= 2 ? " (mes rojo)" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {SIGNAL_KEYS.map((key) => {
            const value = snapshot.signals[key];
            const rank = ranks?.[key];
            const red = isRedRank(rank);
            const polarity = signalPolarity(key);
            return (
              <div
                key={key}
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  red
                    ? "border-[#fbd3dc] bg-[#fef4f6]"
                    : "border-[#dce0e6] bg-white"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium tracking-[-0.14px] text-black">
                      {signalLabel(key)}
                    </p>
                    <p className="mt-0.5 text-[12px] tracking-[-0.12px] text-[#6b6b6b]">
                      {signalBlurb(key)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-medium tabular-nums tracking-[-0.14px] text-black">
                      {formatSignalValue(key, value)}
                    </p>
                    {rank != null ? (
                      <p
                        className={cn(
                          "text-[11px] font-medium",
                          red ? "text-[#e61847]" : "text-[#6b6b6b]"
                        )}
                      >
                        p{Math.round(rank * 100)}
                        {red ? " · cola roja" : ""}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-[#6b6b6b]">
                      {polarity === "high" ? "↑ peor" : "↓ peor"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 border-t border-[#dce0e6] pt-3">
          <p className="mb-2 text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]">
            Dimensiones
          </p>
          <DimensionRadar dimensions={snapshot.dimensions} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
