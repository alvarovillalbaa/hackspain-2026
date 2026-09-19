"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { actionKindLabel, formatCurrency, formatNumber } from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import { OriginChip } from "./origin-chip";
import { ScoreUplift } from "./score-uplift";
import { cn } from "@/lib/utils";

function Tile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

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
  href?: string;
}) {
  const projection = snapshot
    ? publishedProjection(snapshot, action)
    : null;

  return (
    <Card
      size="sm"
      className={cn(
        "cursor-pointer transition-colors",
        selected && "ring-2 ring-foreground/20"
      )}
      onClick={onToggle}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {onToggle ? (
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggle()}
                onClick={(e) => e.stopPropagation()}
                className="mt-1"
              />
            ) : null}
            <div>
              <CardTitle>{action.title}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {actionKindLabel(action.kind)}
              </p>
            </div>
          </div>
          <OriginChip origin={action.origin} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Importe">
            <p className="font-mono text-lg font-semibold tabular-nums leading-tight">
              {formatCurrency(action.recommended_amount, currency)}
            </p>
          </Tile>
          <Tile label="Score si la haces">
            {projection ? (
              <>
                <p className="font-mono text-lg font-semibold tabular-nums leading-tight">
                  {formatNumber(projection.before)} → {formatNumber(projection.after)}
                </p>
                <ScoreUplift
                  className="mt-1"
                  uplift={projection.uplift}
                  toBand={projection.toBand}
                />
              </>
            ) : (
              <ScoreUplift uplift={action.uplift} />
            )}
          </Tile>
        </div>
        <Tile label="Por qué">
          <p className="text-sm leading-snug">{action.rationale}</p>
        </Tile>
        {href ? (
          <a
            href={href}
            className="inline-flex text-sm font-medium underline-offset-4 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Ver productos →
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
