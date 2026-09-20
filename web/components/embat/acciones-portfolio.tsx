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
import { signedBadgeClass } from "@/components/embat/chrome";
import { ErrorState } from "@/components/xray/feedback-state";
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
  const { data, loading, error } = usePortfolioActions();

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
    <SortableTable
      rows={data}
      columns={columns}
      rowKey={(r) => `${r.company_id}:${r.id}`}
      defaultSortKey="uplift"
      onRowClick={(row) => router.push(portfolioActionHref(row))}
    />
  );
}
