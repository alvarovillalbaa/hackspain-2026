"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/xray/feedback-state";
import {
  embatFocusRing,
  embatRowFocusRing,
} from "@/components/embat/chrome";
import { formatNumber } from "@/lib/xray/format";
import { sortRows, type SortDir } from "@/lib/xray/query-filters";
import { cn } from "@/lib/utils";

export type SortableColumn<T> = {
  id: string;
  header: string;
  /** Field used for sorting; omit to disable sort on this column. */
  sortKey?: keyof T & string;
  className?: string;
  align?: "left" | "right" | "center";
  cell: (row: T) => ReactNode;
};

/** Rows rendered before the "Mostrar más" step. */
export const TABLE_PAGE_SIZE = 50;

/**
 * Client-side incremental pagination shared by every long list.
 * Resets to the first page whenever `rows` or `resetKey` changes, so a new
 * filter or sort never strands the reader on an empty page.
 */
export function useTablePagination<T>(
  rows: T[],
  resetKey: string = ""
): {
  pageRows: T[];
  total: number;
  shown: number;
  hasMore: boolean;
  showMore: () => void;
} {
  const [visible, setVisible] = useState(TABLE_PAGE_SIZE);
  const [prev, setPrev] = useState<{ rows: T[]; key: string }>({
    rows,
    key: resetKey,
  });
  if (prev.rows !== rows || prev.key !== resetKey) {
    setPrev({ rows, key: resetKey });
    setVisible(TABLE_PAGE_SIZE);
  }

  const pageRows = useMemo(() => rows.slice(0, visible), [rows, visible]);

  return {
    pageRows,
    total: rows.length,
    shown: pageRows.length,
    hasMore: rows.length > pageRows.length,
    showMore: () => setVisible((v) => v + TABLE_PAGE_SIZE),
  };
}

/** Count + "Mostrar 50 más" footer, shared by the five long lists. */
export function TablePagination({
  total,
  shown,
  hasMore,
  onShowMore,
  className,
}: {
  total: number;
  shown: number;
  hasMore: boolean;
  onShowMore: () => void;
  className?: string;
}) {
  if (total === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 px-5 py-[15px]",
        className
      )}
    >
      <p className="text-[12px] font-medium tracking-[-0.12px] tabular-nums text-muted-foreground">
        {shown === 0 ? "0" : "1"} a {formatNumber(shown)} de {formatNumber(total)}
      </p>
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("rounded-xl", embatFocusRing)}
          onClick={onShowMore}
        >
          Mostrar {TABLE_PAGE_SIZE} más
        </Button>
      ) : null}
    </div>
  );
}

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  leading,
  empty,
  className,
  defaultSortKey,
  defaultSortDir = "desc",
}: {
  rows: T[];
  columns: SortableColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Optional leading cell (e.g. checkbox). */
  leading?: (row: T) => ReactNode;
  empty?: ReactNode;
  className?: string;
  defaultSortKey?: keyof T & string;
  defaultSortDir?: SortDir;
}) {
  const [sortKey, setSortKey] = useState<(keyof T & string) | null>(
    defaultSortKey ?? null
  );
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const sorted = useMemo(
    () => sortRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir]
  );

  const { pageRows, total, shown, hasMore, showMore } = useTablePagination(
    sorted,
    `${sortKey ?? ""}:${sortDir}`
  );

  const toggle = (key: keyof T & string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <TableRow className="hover:bg-transparent">
            {leading ? (
              <TableHead className="w-10 px-2" aria-hidden />
            ) : null}
            {columns.map((col) => {
              const active = sortKey === col.sortKey;
              const sortable = Boolean(col.sortKey);
              return (
                <TableHead
                  key={col.id}
                  className={cn(
                    "text-[13px] font-medium text-table-header",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-[2px] hover:text-foreground",
                        embatFocusRing
                      )}
                      onClick={() => toggle(col.sortKey!)}
                    >
                      {col.header}
                      {active ? (
                        sortDir === "asc" ? (
                          <ArrowUpIcon className="size-3.5" />
                        ) : (
                          <ArrowDownIcon className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDownIcon className="size-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (leading ? 1 : 0)}
                className="py-8"
              >
                {empty ?? (
                  <EmptyState
                    title="Sin resultados"
                    description="Sin filas que coincidan con el filtro."
                    placement="card"
                  />
                )}
              </TableCell>
            </TableRow>
          ) : (
            pageRows.map((row) => (
              <TableRow
                key={rowKey(row)}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  onRowClick && embatRowFocusRing
                )}
                onClick={() => onRowClick?.(row)}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {leading ? (
                  <TableCell
                    className="w-10 px-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {leading(row)}
                  </TableCell>
                ) : null}
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className
                    )}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePagination
        total={total}
        shown={shown}
        hasMore={hasMore}
        onShowMore={showMore}
        className="border-t border-border"
      />
    </div>
  );
}
