"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { actionKindLabel, formatCurrency, formatDelta } from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";
import { cn } from "@/lib/utils";

export function ActionCard({
  action,
  snapshot,
  currency = "EUR",
  selected,
  onToggle,
  href,
}: {
  action: ActionRecommendation;
  snapshot?: ScoreSnapshot | null;
  currency?: string;
  selected?: boolean;
  onToggle?: () => void;
  href: string;
}) {
  const projection = snapshot
    ? publishedProjection(snapshot, action)
    : null;
  const uplift = projection?.uplift ?? action.uplift;
  const reasoning = action.reasoning ?? action.rationale;
  const upliftClass = cn(
    "font-heading text-3xl font-semibold tabular-nums tracking-tight",
    uplift >= 0 ? "text-emerald-600" : "text-red-600"
  );

  const body = (
    <>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {onToggle ? (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggle()}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Seleccionar ${action.title}`}
                className="mt-1 shrink-0"
              />
            ) : null}
            <div className="min-w-0">
              <CardTitle className="line-clamp-2">{action.title}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {actionKindLabel(action.kind)} ·{" "}
                {formatCurrency(action.recommended_amount, currency)}
              </p>
            </div>
          </div>
          <ReasoningHint text={reasoning} />
        </div>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <p className={upliftClass}>{formatDelta(uplift)}</p>
        {onToggle ? (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {action.kind === "amortize" ? "Ver impacto →" : "Ver productos →"}
          </Link>
        ) : null}
      </CardContent>
    </>
  );

  // Selectable cards toggle on click so several actions can be combined into a
  // single uplift; without `onToggle` the whole card is just a link.
  if (onToggle) {
    return (
      <Card
        size="sm"
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/30",
          selected && "ring-2 ring-foreground/20"
        )}
      >
        {body}
      </Card>
    );
  }

  return (
    <Link href={href} className="block">
      <Card size="sm" className="transition-colors hover:bg-muted/30">
        {body}
      </Card>
    </Link>
  );
}
