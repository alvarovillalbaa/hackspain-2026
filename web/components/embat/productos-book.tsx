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
import { IssuerMark } from "@/components/embat/offer-ui";
import { embatRowFocusRing } from "@/components/embat/chrome";
import { useBookProducts } from "@/hooks/xray/use-book-products";
import { formatCompactEuro, formatRatePct } from "@/lib/xray/format";
import { cn } from "@/lib/utils";

export function ProductosBook() {
  const { data, loading, error } = useBookProducts();

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
        No se ha podido cargar el libro. {error.message}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <Empty className="min-h-[280px] border-0">
        <EmptyHeader>
          <EmptyTitle>Sin productos</EmptyTitle>
          <EmptyDescription>
            Sin deuda viva ni ofertas contratadas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-0">
      {data.map((row, i) => (
        <div key={row.id}>
          {i > 0 ? <ItemSeparator className="my-0" /> : null}
          <Item
            size="sm"
            className={cn(
              "rounded-none border-0 px-0 py-3 transition-colors duration-150 ease-out hover:bg-muted/50 motion-reduce:transition-none",
              embatRowFocusRing
            )}
            render={<Link href={`/c/${row.company_id}`} />}
          >
            <div className="flex shrink-0 items-center pr-3">
              <IssuerMark name={row.entity_name} />
            </div>
            <ItemContent>
              <ItemTitle className="text-[15px]" title={row.company_name}>
                {row.company_name}
              </ItemTitle>
              <ItemDescription>{row.entity_name}</ItemDescription>
            </ItemContent>
            <ItemActions className="flex-wrap justify-end gap-2">
              <Badge variant="secondary" className="rounded-xl">
                {row.type_label}
              </Badge>
              <span className="min-w-[4.5rem] text-right text-sm tabular-nums">
                {row.outstanding != null
                  ? formatCompactEuro(row.outstanding)
                  : "—"}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatRatePct(row.annual_rate)}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {row.residual_periods != null
                  ? `${row.residual_periods} m`
                  : "—"}
              </span>
            </ItemActions>
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}
