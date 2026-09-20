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
                      className="inline-flex items-center gap-1 hover:text-foreground"
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
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (leading ? 1 : 0)}
                className="py-8"
              >
                {empty ?? (
                  <p className="text-sm text-muted-foreground">Sin datos.</p>
                )}
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
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
    </div>
  );
}
