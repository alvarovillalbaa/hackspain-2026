"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/xray/sortable-table";
import { useWatchQueue } from "@/hooks/xray/use-watch-queue";
import {
  localizeWatchMessage,
  severityLabel,
  watchRuleLabel,
} from "@/lib/xray/labels";
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
              {localizeWatchMessage(row.message)}
            </div>
          </div>
        ),
      },
      {
        id: "rules",
        header: "Reglas",
        className: "hidden md:table-cell",
        cell: (row) =>
          row.rules.map((r) => watchRuleLabel(r)).join(" · "),
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
            {severityLabel(row.severity)}
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
      <EmptyState
        title="Sin alertas"
        description="No hay empresas en la cola de vigilancia ahora mismo."
      />
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
