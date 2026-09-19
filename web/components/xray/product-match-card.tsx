"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/xray/format";
import type { ProductMatch } from "@/lib/xray/types";
import { ReasoningHint } from "./reasoning-hint";
import { ScoreDeltaBar } from "./score-delta-bar";
import { cn } from "@/lib/utils";

export function ProductMatchCard({
  match,
  href,
  currentScore,
  className,
}: {
  match: ProductMatch;
  href: string;
  currentScore: number;
  className?: string;
}) {
  const reasoning = [
    match.rationale,
    match.risks?.length ? `Riesgos: ${match.risks.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <Link href={href} className="block">
      <Card
        size="sm"
        className={cn(
          "transition-colors hover:bg-muted/30",
          className
        )}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="line-clamp-2">{match.product.label}</CardTitle>
              <CardDescription className="mt-1">
                {match.product.issuer.name} · {formatCurrency(match.amount)}
              </CardDescription>
            </div>
            <ReasoningHint text={reasoning || null} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">Match</div>
              <div className="font-heading text-2xl font-semibold tabular-nums">
                {formatPercent(match.breakdown.match)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                C {formatPercent(match.breakdown.client_fit)} · E{" "}
                {formatPercent(match.breakdown.issuer_appetite)}
              </div>
            </div>
          </div>
          <ScoreDeltaBar
            current={currentScore}
            uplift={match.uplift}
            toBand={match.projected_band}
          />
        </CardContent>
      </Card>
    </Link>
  );
}
