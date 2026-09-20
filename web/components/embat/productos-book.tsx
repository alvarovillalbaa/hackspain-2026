"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { IssuerMark } from "@/components/embat/offer-ui";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/xray/sortable-table";
import { useBookProducts } from "@/hooks/xray/use-book-products";
import type { BookProduct } from "@/lib/xray/book-products";
import { formatCompactEuro, formatRatePct } from "@/lib/xray/format";
import { productTypeLabel } from "@/lib/xray/labels";

export function ProductosBook() {
  const router = useRouter();
  const { data, loading, error } = useBookProducts();

  const columns: SortableColumn<BookProduct>[] = useMemo(
    () => [
      {
        id: "company",
        header: "Empresa",
        sortKey: "company_name",
        cell: (row) => (
          <div className="flex items-center gap-3">
            <IssuerMark name={row.entity_name} />
            <div>
              <div className="font-medium">{row.company_name}</div>
              <div className="text-[12px] text-muted-foreground">
                {row.entity_name}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Tipo",
        sortKey: "type_label",
        cell: (row) => (
          <Badge variant="secondary" className="rounded-xl">
            {productTypeLabel(row.type_label)}
          </Badge>
        ),
      },
      {
        id: "outstanding",
        header: "Vivo",
        sortKey: "outstanding",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">
            {row.outstanding != null
              ? formatCompactEuro(row.outstanding)
              : "—"}
          </span>
        ),
      },
      {
        id: "rate",
        header: "Tipo %",
        className: "hidden md:table-cell",
        sortKey: "annual_rate",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {formatRatePct(row.annual_rate)}
          </span>
        ),
      },
      {
        id: "residual",
        header: "Plazo",
        className: "hidden md:table-cell",
        sortKey: "residual_periods",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {row.residual_periods != null
              ? `${row.residual_periods} m`
              : "—"}
          </span>
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
        title="No se ha podido cargar el libro"
        description={error.message}
      />
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title="Sin productos"
        description="Sin deuda viva ni ofertas contratadas."
      />
    );
  }

  return (
    <SortableTable
      rows={data}
      columns={columns}
      rowKey={(r) => r.id}
      defaultSortKey="outstanding"
      onRowClick={(row) => router.push(`/c/${row.company_id}`)}
    />
  );
}
