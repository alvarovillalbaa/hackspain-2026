"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { signedBadgeClass } from "@/components/embat/chrome";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/xray/sortable-table";
import { usePortfolioActions } from "@/hooks/xray/use-portfolio-actions";
import {
  formatCompactEuro,
  formatSignedNumber,
  actionKindLabel,
} from "@/lib/xray/format";
import {
  portfolioActionHref,
  type PortfolioAction,
} from "@/lib/xray/portfolio-actions";
import { cn } from "@/lib/utils";

export function AccionesPortfolio() {
  const router = useRouter();
  const { data: rows, loading, error } = usePortfolioActions();

  const columns: SortableColumn<PortfolioAction>[] = useMemo(
    () => [
      {
        id: "company",
        header: "Empresa",
        sortKey: "company_name",
        cell: (row) => (
          <div>
            <div className="font-medium">{row.company_name}</div>
            <div className="text-[12px] text-muted-foreground">
              {actionKindLabel(row.kind)} · {row.title}
            </div>
          </div>
        ),
      },
      {
        id: "kind",
        header: "Tipo",
        className: "hidden md:table-cell",
        sortKey: "kind",
        cell: (row) => actionKindLabel(row.kind),
      },
      {
        id: "amount",
        header: "Importe",
        sortKey: "recommended_amount",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {formatCompactEuro(row.recommended_amount)}
          </span>
        ),
      },
      {
        id: "uplift",
        header: "Uplift",
        sortKey: "uplift",
        align: "right",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn("rounded-xl", signedBadgeClass(row.uplift))}
          >
            {formatSignedNumber(row.uplift)}
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
        title="No se han podido cargar las acciones"
        description={error.message}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Sin acciones"
        description="Sin acciones recomendadas en el grupo activo."
      />
    );
  }

  return (
    <SortableTable
      rows={rows}
      columns={columns}
      rowKey={(r) => `${r.company_id}:${r.id}`}
      defaultSortKey="uplift"
      onRowClick={(row) => router.push(portfolioActionHref(row))}
    />
  );
}
