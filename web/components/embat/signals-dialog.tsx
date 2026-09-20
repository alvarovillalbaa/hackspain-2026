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

const SIGNAL_RISK_SCALE: Record<string, number> = {
  cash_buffer_days: 90,
  overdue_flow_rate_3m: 0.05,
  dscr_6m: 1.5,
  net_cash_flow_ratio_3m: 1,
};

const SIGNAL_LOW_IS_WORSE = new Set([
  "cash_buffer_days",
  "dscr_6m",
  "net_cash_flow_ratio_3m",
]);

function signalRisk(signal: string, value: number): number {
  const scale = SIGNAL_RISK_SCALE[signal] ?? 1;
  const raw = SIGNAL_LOW_IS_WORSE.has(signal)
    ? (scale - value) / scale
    : value / scale;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Red signals. With `ranks` (percentile within the month, from the Health
 * Scorer export) the cut is exact: rank ≤ 0.20. Packs without ranks fall back
 * to tinting the `n_red` riskiest signals by a fixed scale, so header and
 * cards still agree.
 */
function redSignalKeys(snapshot: ScoreSnapshot): Set<string> {
  if (snapshot.ranks) {
    const ranks = snapshot.ranks;
    return new Set(SIGNAL_KEYS.filter((key) => isRedRank(ranks[key])));
  }
  const available = SIGNAL_KEYS.filter(
    (key) => snapshot.signals[key] != null
  ).sort(
    (a, b) =>
      signalRisk(b, snapshot.signals[b] as number) -
      signalRisk(a, snapshot.signals[a] as number)
  );
  const count = Math.min(snapshot.n_red, available.length);
  return new Set(available.slice(0, count));
}

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: ScoreSnapshot;
}) {
  const redKeys = redSignalKeys(snapshot);
  const nRed = redKeys.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Señales del índice</DialogTitle>
          <DialogDescription>
            {snapshot.n_signals} señales · {nRed} en rojo
            {nRed >= 2 ? " (mes rojo)" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {SIGNAL_KEYS.map((key) => {
            const value = snapshot.signals[key];
            const red = redKeys.has(key);
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
                    {red ? (
                      <p className="text-[11px] font-medium tracking-[-0.11px] text-[#b3123a]">
                        En rojo
                      </p>
                    ) : null}
                    {snapshot.ranks?.[key] != null ? (
                      <p className="text-[11px] tabular-nums tracking-[-0.11px] text-[#6b6b6b]">
                        percentil {Math.round(snapshot.ranks[key]! * 100)}
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
