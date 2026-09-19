"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { actionKindLabel, formatCurrency } from "@/lib/xray/format";
import type { ActionRecommendation } from "@/lib/xray/types";
import { OriginChip } from "./origin-chip";
import { ScoreUplift } from "./score-uplift";
import { cn } from "@/lib/utils";

export function ActionCard({
  action,
  selected,
  onToggle,
  href,
}: {
  action: ActionRecommendation;
  selected?: boolean;
  onToggle?: () => void;
  href?: string;
}) {
  const content = (
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
              <CardDescription className="mt-1">
                {actionKindLabel(action.kind)} ·{" "}
                {formatCurrency(action.recommended_amount)}
              </CardDescription>
            </div>
          </div>
          <OriginChip origin={action.origin} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{action.rationale}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Impacto estimado</span>
          <ScoreUplift uplift={action.uplift} />
        </div>
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

  return content;
}
