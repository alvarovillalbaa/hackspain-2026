"use client";

import { cn } from "@/lib/utils";
import type { MarketplacePhase } from "@/lib/xray/marketplace-progress";

const STEPS = [
  { id: "quantity", label: "Quantify" },
  { id: "offering", label: "Offerings" },
  { id: "match", label: "Match" },
] as const;

function stepState(
  phase: MarketplacePhase,
  id: (typeof STEPS)[number]["id"]
): "idle" | "active" | "done" {
  if (phase === "done") return "done";
  if (phase === "fallback") return "idle";
  const order = ["queued", "quantity", "offering", "match"] as const;
  const current = order.indexOf(phase as (typeof order)[number]);
  const mine = order.indexOf(id);
  if (current < 0) return "idle";
  if (mine < current) return "done";
  if (mine === current) return "active";
  return "idle";
}

export function MarketplacePipeline({
  phase,
  detail,
}: {
  phase: MarketplacePhase;
  detail?: string | null;
}) {
  if (phase === "idle") return null;
  return (
    <div className="mb-6 space-y-2">
      <div className="flex flex-wrap gap-2">
        {STEPS.map((step) => {
          const state = stepState(phase, step.id);
          return (
            <span
              key={step.id}
              className={cn(
                "inline-flex h-8 items-center rounded-4xl px-3 text-xs font-medium tracking-wide uppercase",
                state === "active" && "bg-primary text-primary-foreground",
                state === "done" && "bg-secondary text-secondary-foreground",
                state === "idle" && "bg-muted text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          );
        })}
      </div>
      {detail ? (
        <p className="text-xs text-muted-foreground">{detail}</p>
      ) : phase === "fallback" ? (
        <p className="text-xs text-destructive">
          Pipeline incompleto — motor determinista.
        </p>
      ) : null}
    </div>
  );
}
