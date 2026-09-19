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
import { useWatchQueue } from "@/hooks/xray/use-watch-queue";
import { WATCH_RULE_LABEL } from "@/lib/xray/watch-queue";
import { cn } from "@/lib/utils";

export function Watchers() {
  const { data, loading, error } = useWatchQueue();

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
        No se ha podido cargar la cola de vigilancia. {error.message}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <Empty className="min-h-[280px] border-0">
        <EmptyHeader>
          <EmptyTitle>Sin alertas</EmptyTitle>
          <EmptyDescription>
            No hay empresas en la cola de vigilancia ahora mismo.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ItemGroup className="gap-0">
      {data.map((item, i) => (
        <div key={item.company_id}>
          {i > 0 ? <ItemSeparator className="my-0" /> : null}
          <Item
            size="sm"
            className="rounded-none border-0 px-0 py-3"
            render={<Link href={`/c/${item.company_id}`} />}
          >
            <ItemContent>
              <ItemTitle className="text-[15px]">{item.name}</ItemTitle>
              <ItemDescription>{item.message}</ItemDescription>
            </ItemContent>
            <ItemActions className="flex-wrap justify-end gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "rounded-xl",
                  item.severity === "critical"
                    ? "border-[#fbd3dc] bg-[#fef4f6] text-[#e61847]"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {item.severity === "critical" ? "Crítica" : "Aviso"}
              </Badge>
              {item.rules.map((rule) => (
                <Badge
                  key={rule}
                  variant="secondary"
                  className="rounded-xl"
                >
                  {WATCH_RULE_LABEL[rule]}
                </Badge>
              ))}
              {item.score != null ? (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {Math.round(item.score)}
                </span>
              ) : null}
            </ItemActions>
          </Item>
        </div>
      ))}
    </ItemGroup>
  );
}
