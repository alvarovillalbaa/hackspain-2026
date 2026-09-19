"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { actionKindLabel, formatCurrency, formatDelta } from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";
import { cn } from "@/lib/utils";

export function ActionCard({
  action,
  snapshot,
  currency = "EUR",
  href,
}: {
  action: ActionRecommendation;
  snapshot?: ScoreSnapshot | null;
  currency?: string;
  href: string;
}) {
  const projection = snapshot
    ? publishedProjection(snapshot, action)
    : null;
  const uplift = projection?.uplift ?? action.uplift;
  const reasoning = action.reasoning ?? action.rationale;

  return (
    <Link href={href} className="block">
      <Card
        size="sm"
        className="transition-colors hover:bg-muted/30"
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="line-clamp-2">{action.title}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {actionKindLabel(action.kind)} ·{" "}
                {formatCurrency(action.recommended_amount, currency)}
              </p>
            </div>
            <ReasoningHint text={reasoning} />
          </div>
        </CardHeader>
        <CardContent>
          <p
            className={cn(
              "font-heading text-3xl font-semibold tabular-nums tracking-tight",
              uplift >= 0 ? "text-emerald-600" : "text-red-600"
            )}
          >
            {formatDelta(uplift)}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
