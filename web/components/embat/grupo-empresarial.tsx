"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DemoChip,
  EmbatIcon,
  embatFocusRing,
  embatRowFocusRing,
  FilterChip,
  FilterField,
  statusClass,
} from "@/components/embat/chrome";
import { useGroups } from "@/hooks/xray/use-groups";
import { useDemoSession } from "@/hooks/xray/use-demo-session";
import {
  formatCompactEuro,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import { outlookMeta } from "@/lib/xray/bands";
import type { GroupSummary } from "@/lib/xray/group-summary";
import type { Outlook } from "@/lib/xray/types";
import { embatDisplayClass } from "@/components/embat/font";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
import {
  TablePagination,
  useTablePagination,
} from "@/components/xray/sortable-table";
import { cn } from "@/lib/utils";

type OutlookFilter = Outlook | "all";

interface Filters {
  name: string;
  minScore: number | null;
  outlook: OutlookFilter;
  minCompanies: number | null;
  minCash: number | null;
}

const EMPTY_FILTERS: Filters = {
  name: "",
  minScore: null,
  outlook: "all",
  minCompanies: null,
  minCash: null,
};

function matchesFilters(
  group: GroupSummary,
  query: string,
  filters: Filters
): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !group.name.toLowerCase().includes(q) &&
    !group.group_id.toLowerCase().includes(q) &&
    !group.best_company_name.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (
    filters.name &&
    !group.name.toLowerCase().includes(filters.name.toLowerCase())
  ) {
    return false;
  }
  if (filters.minScore != null && group.score < filters.minScore) return false;
  if (filters.outlook !== "all" && group.outlook !== filters.outlook) {
    return false;
  }
  if (filters.minCompanies != null && group.n_companies < filters.minCompanies) {
    return false;
  }
  if (filters.minCash != null && group.cash_close < filters.minCash) {
    return false;
  }
  return true;
}

const COLUMNS = [
  { label: "Nombre", align: "left" },
  { label: "Puntuación", align: "right" },
  { label: "Estado", align: "left" },
  { label: "Empresas", align: "right" },
  { label: "Mejor Empresa", align: "left" },
  { label: "Cierre Agregado", align: "right" },
] as const;

export function GrupoEmpresarial({ className }: { className?: string }) {
  const router = useRouter();
  const { data, loading, error } = useGroups();
  const focusGroupId = useDemoSession();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const rows = useMemo(() => {
    const filtered = data.filter((g) => matchesFilters(g, query, filters));
    // Keep the rehearsal group visible on the first page of the default order.
    const at = filtered.findIndex((g) => g.group_id === focusGroupId);
    if (at <= 0) return filtered;
    const pinned = filtered[at]!;
    return [pinned, ...filtered.slice(0, at), ...filtered.slice(at + 1)];
  }, [data, query, filters, focusGroupId]);

  const { pageRows, total, shown, hasMore, showMore } =
    useTablePagination(rows);

  const updatedAt = data[0]?.month
    ? formatSlashDateFromMonth(data[0].month)
    : null;

  return (
    <section
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/40",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-[15px]">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h1
            className={`${embatDisplayClass} shrink-0 text-[20px] font-medium tracking-[-0.3px] text-nowrap text-foreground`}
          >
            Grupos Empresariales
          </h1>
          {updatedAt ? (
            <p className="shrink-0 rounded-xl border border-primary/20 bg-primary/5 px-[3px] py-0.5 text-[12px] font-medium tracking-[-0.18px] text-nowrap text-primary">
              Última actualización: {updatedAt}
            </p>
          ) : null}
        </div>
        <label className="flex w-[200px] max-w-full shrink-0 items-center gap-[5px] rounded-xl bg-muted px-[5px] py-[2px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-solid focus-within:outline-ring">
          <span className="sr-only">Buscar grupo</span>
          <EmbatIcon src="/embat/icon-search.svg" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 px-5 py-[15px]">
        <FilterChip
          icon="/embat/icon-filter.svg"
          label="Nombre"
          active={Boolean(filters.name)}
        >
          {(close) => (
            <FilterField
              placeholder="Nombre"
              defaultValue={filters.name}
              onApply={(value) => {
                setFilters((f) => ({ ...f, name: value.trim() }));
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip
          icon="/embat/icon-score.svg"
          label="Puntuación"
          active={filters.minScore != null}
        >
          {(close) => (
            <FilterField
              placeholder="Puntuación mín."
              defaultValue={filters.minScore?.toString() ?? ""}
              inputMode="decimal"
              onApply={(value) => {
                const n = Number(value.replace(",", "."));
                setFilters((f) => ({
                  ...f,
                  minScore: value.trim() && Number.isFinite(n) ? n : null,
                }));
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip
          icon="/embat/icon-status.svg"
          label="Estado"
          active={filters.outlook !== "all"}
        >
          {(close) => (
            <div className="flex w-full flex-col gap-[5px]">
              {(
                [
                  ["all", "Todos"],
                  ["positive", outlookMeta("positive").label],
                  ["stable", outlookMeta("stable").label],
                  ["negative", outlookMeta("negative").label],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilters((f) => ({ ...f, outlook: value }));
                    close();
                  }}
                  className={cn(
                    "w-full rounded-xl px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] transition-colors duration-150 ease-out motion-reduce:transition-none",
                    embatFocusRing,
                    filters.outlook === value
                      ? "bg-primary font-semibold text-white"
                      : "border border-border bg-white text-muted-foreground"
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </FilterChip>
        <FilterChip
          icon="/embat/icon-filter.svg"
          label="Empresas"
          active={filters.minCompanies != null}
        >
          {(close) => (
            <FilterField
              placeholder="Empresas mín."
              defaultValue={filters.minCompanies?.toString() ?? ""}
              inputMode="numeric"
              onApply={(value) => {
                const n = Number(value);
                setFilters((f) => ({
                  ...f,
                  minCompanies:
                    value.trim() && Number.isFinite(n) ? n : null,
                }));
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip
          icon="/embat/icon-filter.svg"
          label="Cierre Agregado"
          active={filters.minCash != null}
        >
          {(close) => (
            <FilterField
              placeholder="Cierre mín. (€)"
              defaultValue={filters.minCash?.toString() ?? ""}
              inputMode="numeric"
              onApply={(value) => {
                const n = Number(value.replace(",", "."));
                setFilters((f) => ({
                  ...f,
                  minCash: value.trim() && Number.isFinite(n) ? n : null,
                }));
                close();
              }}
            />
          )}
        </FilterChip>
      </div>

      <div>
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Grupos empresariales del portfolio</caption>
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <tr className="border-b border-border">
              {COLUMNS.map(({ label, align }) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "overflow-hidden px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-ellipsis whitespace-nowrap text-table-header first:pl-5 last:pr-5",
                    align === "right" && "text-right"
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="border-b border-border">
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-4 w-full rounded bg-[#dce0e6]/50" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-4">
                  <ErrorState
                    title="No se han podido cargar los grupos"
                    description={error.message}
                    placement="card"
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-4">
                  <EmptyState
                    title="Sin grupos"
                    description="Sin grupos que coincidan con el filtro."
                    placement="card"
                  />
                </td>
              </tr>
            ) : (
              pageRows.map((group) => {
                const outlook = outlookMeta(group.outlook);
                return (
                  <tr
                    key={group.group_id}
                    tabIndex={0}
                    onClick={() => router.push(`/g/${group.group_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/g/${group.group_id}`);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors duration-150 ease-out even:bg-[rgba(220,224,230,0.2)] hover:bg-[rgba(220,224,230,0.45)] motion-reduce:transition-none",
                      embatRowFocusRing
                    )}
                  >
                    <td className="px-3 py-[15px] text-[14px] tracking-[-0.14px] text-black first:pl-5">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/g/${group.group_id}`}
                          title={group.name}
                          className={cn(
                            "min-w-0 truncate text-black hover:underline",
                            embatFocusRing
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {group.name}
                        </Link>
                        {focusGroupId === group.group_id ? <DemoChip /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-[15px] text-right">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px] tabular-nums",
                          statusClass(group.outlook)
                        )}
                      >
                        {Math.round(group.score)}
                      </span>
                    </td>
                    <td className="px-3 py-[15px]">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                          statusClass(group.outlook)
                        )}
                      >
                        {outlook.label}
                      </span>
                    </td>
                    <td className="px-3 py-[15px] text-right text-[14px] font-medium tracking-[-0.14px] tabular-nums text-muted-foreground">
                      {group.n_companies}
                    </td>
                    <td
                      className="truncate px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-muted-foreground"
                      title={group.best_company_name}
                    >
                      {group.best_company_name}
                    </td>
                    <td className="px-3 py-[15px] pr-5 text-right text-[14px] tracking-[-0.14px] tabular-nums text-black">
                      {formatCompactEuro(group.cash_close)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <TablePagination
          total={total}
          shown={shown}
          hasMore={hasMore}
          onShowMore={showMore}
          className="border-t border-border"
        />
      </div>
    </section>
  );
}
