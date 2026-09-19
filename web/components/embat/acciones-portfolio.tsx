"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { embatRowFocusRing, signedBadgeClass } from "@/components/embat/chrome";
import { usePortfolioActions } from "@/hooks/xray/use-portfolio-actions";
import {
  formatCompactEuro,
  formatSignedNumber,
  actionKindLabel,
} from "@/lib/xray/format";
import { portfolioActionHref } from "@/lib/xray/portfolio-actions";
import { cn } from "@/lib/utils";

export function AccionesPortfolio() {
  const { data, loading, error } = usePortfolioActions();

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-sm text-destructive">
        No se han podido cargar las acciones. {error.message}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <Empty className="min-h-[280px] border-0">
        <EmptyHeader>
          <EmptyTitle>Sin acciones</EmptyTitle>
          <EmptyDescription>
            Sin acciones recomendadas en la cartera.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-0">
      {data.map((row, i) => {
        const href = portfolioActionHref(row);
        return (
          <div key={`${row.company_id}:${row.id}`}>
            {i > 0 ? <ItemSeparator className="my-0" /> : null}
            <Item
              size="sm"
              className={cn(
                "rounded-none border-0 px-0 py-3 transition-colors duration-150 ease-out hover:bg-muted/50 motion-reduce:transition-none",
                embatRowFocusRing
              )}
              render={<Link href={href} />}
            >
              <ItemContent>
                <ItemTitle className="text-[15px]" title={row.company_name}>
                  {row.company_name}
                </ItemTitle>
                <ItemDescription>
                  {actionKindLabel(row.kind)} · {row.title}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap justify-end gap-2">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatCompactEuro(row.recommended_amount)}
                </span>
                <Badge
                  variant="outline"
                  className={cn("rounded-xl", signedBadgeClass(row.uplift))}
                >
                  {formatSignedNumber(row.uplift)}
                </Badge>
              </ItemActions>
            </Item>
          </div>
        );
      })}
    </ItemGroup>
  );
}
