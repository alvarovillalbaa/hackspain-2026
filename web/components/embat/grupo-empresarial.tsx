"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmbatIcon,
  FilterChip,
  FilterField,
  statusClass,
} from "@/components/embat/chrome";
import { useGroups } from "@/hooks/xray/use-groups";
import {
  formatCompactEuro,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import { outlookMeta } from "@/lib/xray/bands";
import type { GroupSummary } from "@/lib/xray/group-summary";
import type { Outlook } from "@/lib/xray/types";
import { embatDisplayClass } from "@/components/embat/font";
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

export function GrupoEmpresarial({ className }: { className?: string }) {
  const router = useRouter();
  const { data, loading, error } = useGroups();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const rows = useMemo(
    () => data.filter((g) => matchesFilters(g, query, filters)),
    [data, query, filters]
  );

  const updatedAt = data[0]?.month
    ? formatSlashDateFromMonth(data[0].month)
    : null;

  return (
    <section
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#dce0e6] px-5 py-[15px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1
            className={`${embatDisplayClass} shrink-0 text-[20px] font-medium tracking-[-0.3px] text-nowrap text-black`}
          >
            Grupos Empresariales
          </h1>
          {updatedAt ? (
            <p className="shrink-0 rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-[3px] py-0.5 text-[12px] font-medium tracking-[-0.18px] text-nowrap text-[#11a8ff]">
              Última actualización: {updatedAt}
            </p>
          ) : null}
        </div>
        <label className="flex w-[200px] shrink-0 items-center gap-[5px] rounded-[4px] border border-[#dce0e6] bg-white px-[5px] py-[2px]">
          <span className="sr-only">Buscar grupo</span>
          <EmbatIcon src="/embat/icon-search.svg" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar grupo"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.13px] text-black outline-none placeholder:text-[#666]"
          />
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#dce0e6] px-5 py-[15px]">
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
                    "w-full rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px]",
                    filters.outlook === value
                      ? "bg-[#11a8ff] font-semibold text-white"
                      : "border border-[#dce0e6] bg-white text-[#666]"
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
          <thead>
            <tr className="border-b border-[#dce0e6]">
              {(
                [
                  "Nombre",
                  "Puntuación",
                  "Estado",
                  "Empresas",
                  "Mejor Empresa",
                  "Cierre Agregado",
                ] as const
              ).map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="overflow-hidden px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-ellipsis whitespace-nowrap text-[#999] first:pl-5 last:pr-5"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="border-b border-[#dce0e6]">
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-4 w-full rounded bg-[#dce0e6]/50" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-[14px] text-[#e61847]"
                >
                  No se han podido cargar los grupos. {error.message}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-8 text-[14px] text-[#666]"
                >
                  Sin grupos que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              rows.map((group) => {
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
                    className="cursor-pointer border-b border-[#dce0e6] even:bg-[rgba(220,224,230,0.2)] hover:bg-[rgba(220,224,230,0.45)]"
                  >
                    <td className="truncate px-3 py-[15px] text-[14px] tracking-[-0.14px] text-black first:pl-5">
                      <Link
                        href={`/g/${group.group_id}`}
                        title={group.name}
                        className="block truncate text-black hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {group.name}
                      </Link>
                    </td>
                    <td className="px-3 py-[15px]">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                          statusClass(group.outlook)
                        )}
                      >
                        {Math.round(group.score)}
                      </span>
                    </td>
                    <td className="px-3 py-[15px]">
                      <span
                        className={cn(
                          "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                          statusClass(group.outlook)
                        )}
                      >
                        {outlook.label}
                      </span>
                    </td>
                    <td className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]">
                      {group.n_companies}
                    </td>
                    <td
                      className="truncate px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]"
                      title={group.best_company_name}
                    >
                      {group.best_company_name}
                    </td>
                    <td className="px-3 py-[15px] pr-5 text-[14px] tracking-[-0.14px] text-black">
                      {formatCompactEuro(group.cash_close)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
