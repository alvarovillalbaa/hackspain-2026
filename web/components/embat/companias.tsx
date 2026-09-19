"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmbatIcon,
  FilterChip,
  FilterField,
  statusClass,
} from "@/components/embat/chrome";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { outlookMeta } from "@/lib/xray/bands";
import type { CompanySummary } from "@/lib/xray/company-summary";
import {
  formatCompactEuro,
  formatRatePct,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import type { Outlook } from "@/lib/xray/types";
import { embatDisplayClass } from "@/components/embat/font";
import { cn } from "@/lib/utils";

type OutlookFilter = Outlook | "all";

interface Filters {
  name: string;
  minScore: number | null;
  outlook: OutlookFilter;
  minRate: number | null;
  minCash: number | null;
}

const EMPTY_FILTERS: Filters = {
  name: "",
  minScore: null,
  outlook: "all",
  minRate: null,
  minCash: null,
};

function stubSummary(
  company: {
    company_id: string;
    group_id: string;
    name: string;
  },
  month: string
): CompanySummary {
  return {
    company_id: company.company_id,
    group_id: company.group_id,
    name: company.name,
    score: 0,
    outlook: "stable",
    situation: "—",
    implied_rate: null,
    cash_close: 0,
    month,
  };
}

function matchesFilters(
  row: CompanySummary,
  query: string,
  filters: Filters
): boolean {
  const q = query.trim().toLowerCase();
  if (
    q &&
    !row.name.toLowerCase().includes(q) &&
    !row.company_id.toLowerCase().includes(q) &&
    !row.group_id.toLowerCase().includes(q)
  ) {
    return false;
  }
  if (
    filters.name &&
    !row.name.toLowerCase().includes(filters.name.toLowerCase())
  ) {
    return false;
  }
  if (filters.minScore != null && row.score < filters.minScore) return false;
  if (filters.outlook !== "all" && row.outlook !== filters.outlook) {
    return false;
  }
  if (filters.minRate != null) {
    if (row.implied_rate == null || row.implied_rate < filters.minRate) {
      return false;
    }
  }
  if (filters.minCash != null && row.cash_close < filters.minCash) {
    return false;
  }
  return true;
}

export function Companias({ className }: { className?: string }) {
  const router = useRouter();
  const { data, loading, error } = useCompanySummaries();
  const { data: companies, addImported } = useCompanies();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [importOpen, setImportOpen] = useState(false);

  const merged = useMemo(() => {
    const ids = new Set(data.map((c) => c.company_id));
    const month = data[0]?.month ?? "";
    const extra = companies
      .filter((c) => c.imported && !ids.has(c.company_id))
      .map((c) => stubSummary(c, month));
    return [...data, ...extra];
  }, [data, companies]);

  const rows = useMemo(
    () => merged.filter((c) => matchesFilters(c, query, filters)),
    [merged, query, filters]
  );

  const updatedAt = merged[0]?.month
    ? formatSlashDateFromMonth(merged[0].month)
    : null;

  return (
    <>
      <section
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]",
          className
        )}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce0e6] px-5 py-[15px]">
          <div className="flex items-center gap-2.5">
            <h1
              className={`${embatDisplayClass} shrink-0 text-[20px] font-medium tracking-[-0.3px] text-nowrap text-black`}
            >
              Compañías
            </h1>
            {updatedAt ? (
              <p className="shrink-0 rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-[3px] py-0.5 text-[12px] font-medium tracking-[-0.18px] text-nowrap text-[#11a8ff]">
                Última actualización: {updatedAt}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <label className="flex w-[180px] items-center gap-[5px] rounded-[4px] border border-[#dce0e6] bg-white px-[5px] py-[2px]">
              <span className="sr-only">Buscar compañía</span>
              <EmbatIcon src="/embat/icon-search.svg" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar compañía"
                className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tracking-[-0.13px] text-black outline-none placeholder:text-[#666]"
              />
            </label>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-[5px] rounded-[4px] border border-[#dce0e6] bg-white px-[5px] py-[2px] text-[13px] font-medium tracking-[-0.13px] text-[#666]"
            >
              <EmbatIcon src="/embat/icon-import.svg" />
              Importar Compañía
            </button>
          </div>
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
            icon="/embat/icon-rate.svg"
            label="Tipo Actual"
            active={filters.minRate != null}
          >
            {(close) => (
              <FilterField
                placeholder="Tipo mín. (%)"
                defaultValue={
                  filters.minRate != null
                    ? String(filters.minRate * 100)
                    : ""
                }
                inputMode="decimal"
                onApply={(value) => {
                  const n = Number(value.replace(",", "."));
                  setFilters((f) => ({
                    ...f,
                    minRate:
                      value.trim() && Number.isFinite(n) ? n / 100 : null,
                  }));
                  close();
                }}
              />
            )}
          </FilterChip>
          <FilterChip
            icon="/embat/icon-filter.svg"
            label="Cierre año"
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
            <caption className="sr-only">Compañías del grupo</caption>
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[13%]" />
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#dce0e6]">
                {(
                  [
                    "Nombre",
                    "Puntuación",
                    "Estado",
                    "Situación",
                    "Tipo Actual",
                    "Cierre año",
                  ] as const
                ).map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] whitespace-nowrap text-[#999] first:pl-5 last:pr-5"
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
                    No se han podido cargar las compañías. {error.message}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-[14px] text-[#666]"
                  >
                    Sin compañías que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const outlook = outlookMeta(row.outlook);
                  return (
                    <tr
                      key={row.company_id}
                      tabIndex={0}
                      onClick={() => router.push(`/c/${row.company_id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/c/${row.company_id}`);
                        }
                      }}
                      className="cursor-pointer border-b border-[#dce0e6] even:bg-[rgba(220,224,230,0.2)] hover:bg-[rgba(220,224,230,0.45)]"
                    >
                      <td className="truncate px-3 py-[15px] text-[14px] tracking-[-0.14px] text-black first:pl-5">
                        <Link
                          href={`/c/${row.company_id}`}
                          title={row.name}
                          className="block truncate text-black hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-3 py-[15px]">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                            statusClass(row.outlook)
                          )}
                        >
                          {Math.round(row.score)}
                        </span>
                      </td>
                      <td className="px-3 py-[15px]">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                            statusClass(row.outlook)
                          )}
                        >
                          {outlook.label}
                        </span>
                      </td>
                      <td
                        className="truncate px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]"
                        title={row.situation}
                      >
                        {row.situation}
                      </td>
                      <td className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]">
                        {formatRatePct(row.implied_rate)}
                      </td>
                      <td className="px-3 py-[15px] pr-5 text-[14px] tracking-[-0.14px] text-black">
                        {formatCompactEuro(row.cash_close)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={addImported}
        companies={companies}
      />
    </>
  );
}
