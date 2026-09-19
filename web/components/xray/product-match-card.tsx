"use client";

import { motion } from "motion/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/xray/format";
import type { ProductMatch } from "@/lib/xray/types";
import { OriginChip } from "./origin-chip";
import { ScoreUplift } from "./score-uplift";
import { cn } from "@/lib/utils";

export function ProductMatchCard({
  match,
  onOpen,
  className,
}: {
  match: ProductMatch;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <motion.div layoutId={`product-${match.product.product_id}`}>
      <Card
        size="sm"
        className={cn(
          "cursor-pointer transition-colors hover:bg-muted/30",
          className
        )}
        onClick={onOpen}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="line-clamp-2">{match.product.label}</CardTitle>
              <CardDescription className="mt-1">
                {match.product.issuer.name} · {formatCurrency(match.amount)}
              </CardDescription>
            </div>
            <OriginChip origin={match.origin} />
          </div>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-3">
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
          <ScoreUplift uplift={match.uplift} toBand={match.projected_band} />
        </CardContent>
      </Card>
    </motion.div>
  );
}
