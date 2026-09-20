"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { ErrorState } from "@/components/xray/feedback-state";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/xray/sortable-table";
import { useWatchQueue } from "@/hooks/xray/use-watch-queue";
import { WATCH_RULE_LABEL } from "@/lib/xray/watch-queue";
import type { WatchQueueItem } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export function Watchers() {
  const router = useRouter();
  const { data, loading, error } = useWatchQueue();

  const columns: SortableColumn<WatchQueueItem>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Empresa",
        sortKey: "name",
        cell: (row) => (
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-[12px] text-muted-foreground">
              {row.message}
            </div>
          </div>
        ),
      },
      {
        id: "rules",
        header: "Reglas",
        cell: (row) =>
          row.rules.map((r) => WATCH_RULE_LABEL[r] ?? r).join(" · "),
      },
      {
        id: "severity",
        header: "Severidad",
        sortKey: "severity",
        align: "right",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn(
              "rounded-xl",
              row.severity === "critical"
                ? "border-destructive/20 bg-destructive/5 text-destructive"
                : "border-warning/30 bg-warning/10 text-warning"
            )}
          >
            {row.severity}
          </Badge>
        ),
      },
    ],
    []
  );

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
      <ErrorState
        title="No se ha podido cargar la cola de vigilancia"
        description={error.message}
      />
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
    <SortableTable
      rows={data}
      columns={columns}
      rowKey={(r) => r.company_id}
      defaultSortKey="severity"
      onRowClick={(row) => router.push(`/c/${row.company_id}`)}
    />
  );
}
