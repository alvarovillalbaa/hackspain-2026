"use client";

import { Landmark, Scale, Wallet, type LucideIcon } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { MarketplacePhase } from "@/lib/xray/marketplace-progress";

const STEPS: {
  id: "quantity" | "offering" | "match";
  label: string;
  Icon: LucideIcon;
}[] = [
  {
    id: "quantity",
    label: "Asegurándonos de la cantidad de financiación ideal…",
    Icon: Wallet,
  },
  {
    id: "offering",
    label: "Buscando los mejores proveedores para ti…",
    Icon: Landmark,
  },
  {
    id: "match",
    label: "Evaluando cada una de las ofertas…",
    Icon: Scale,
  },
];

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
  if (mine === current || (phase === "queued" && id === "quantity")) {
    return "active";
  }
  return "idle";
}

export function MarketplacePipeline({
  phase,
  detail,
}: {
  phase: MarketplacePhase;
  detail?: string | null;
}) {
  if (phase === "idle" || phase === "done") return null;

  const active =
    STEPS.find((s) => stepState(phase, s.id) === "active") ?? STEPS[0]!;
  const ActiveIcon = active.Icon;

  return (
    <Empty className="min-h-[420px] border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-16 rounded-2xl bg-primary/10 text-primary">
          <ActiveIcon className="size-8 animate-pulse" aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="max-w-md text-base font-medium text-foreground">
          {active.label}
        </EmptyTitle>
      </EmptyHeader>
      <div className="flex w-full max-w-sm flex-col gap-3">
        {STEPS.map((step) => {
          const state = stepState(phase, step.id);
          const Icon = step.Icon;
          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors",
                state === "active" && "bg-primary/10 text-primary",
                state === "done" && "text-muted-foreground",
                state === "idle" && "text-muted-foreground/60"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-background">
                {state === "active" ? (
                  <Spinner className="size-4 text-primary" />
                ) : (
                  <Icon className="size-4" aria-hidden />
                )}
              </span>
              <span className={cn(state === "active" && "font-medium")}>
                {step.label}
              </span>
            </div>
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
    </Empty>
  );
}
