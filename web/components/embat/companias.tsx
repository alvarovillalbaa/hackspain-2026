"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmbatButton,
  EmbatIcon,
  FilterChip,
  FilterField,
  statusClass,
} from "@/components/embat/chrome";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useSelection } from "@/hooks/xray/use-selection";
import { BANDS, outlookMeta, scoreToBand } from "@/lib/xray/bands";
import type { CompanySummary } from "@/lib/xray/company-summary";
import { MAX_COMPARE, compareHref } from "@/lib/xray/compare";
import {
  formatCompactEuro,
  formatRatePct,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import type { Band, Outlook } from "@/lib/xray/types";
import { embatDisplayClass } from "@/components/embat/font";
import { cn } from "@/lib/utils";

type OutlookFilter = Outlook | "all";
type OriginFilter = "all" | "catalog" | "imported";

interface Filters {
  name: string;
  minScore: number | null;
  outlook: OutlookFilter;
  minRate: number | null;
  minCash: number | null;
  band: Band | "all";
  currency: string;
  origin: OriginFilter;
}

const EMPTY_FILTERS: Filters = {
  name: "",
  minScore: null,
  outlook: "all",
  minRate: null,
  minCash: null,
  band: "all",
  currency: "all",
  origin: "all",
};

type TableRow = CompanySummary & {
  currency: string;
  imported?: boolean;
  band: Band;
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
  row: TableRow,
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
  if (filters.band !== "all" && row.band !== filters.band) return false;
  if (filters.currency !== "all" && row.currency !== filters.currency) {
    return false;
  }
  if (filters.origin === "imported" && !row.imported) return false;
  if (filters.origin === "catalog" && row.imported) return false;
  return true;
}

export function Companias({ className }: { className?: string }) {
  const router = useRouter();
  const { data, loading, error } = useCompanySummaries();
  const { data: companies, addImported } = useCompanies();
  const selection = useSelection<string>([], MAX_COMPARE);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [importOpen, setImportOpen] = useState(false);

  const byCompany = useMemo(
    () => new Map(companies.map((c) => [c.company_id, c])),
    [companies]
  );

  const currencies = useMemo(
    () => [...new Set(companies.map((c) => c.currency))].sort(),
    [companies]
  );

  const merged = useMemo((): TableRow[] => {
    const ids = new Set(data.map((c) => c.company_id));
    const month = data[0]?.month ?? "";
    const extra = companies
      .filter((c) => c.imported && !ids.has(c.company_id))
      .map((c) => stubSummary(c, month));
    return [...data, ...extra].map((row) => {
      const ref = byCompany.get(row.company_id);
      return {
        ...row,
        currency: ref?.currency ?? "EUR",
        imported: ref?.imported,
        band: ref?.band ?? scoreToBand(row.score),
      };
    });
  }, [data, companies, byCompany]);

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
          <FilterChip
            icon="/embat/icon-filter.svg"
            label="Banda"
            active={filters.band !== "all"}
          >
            {(close) => (
              <div className="flex max-h-64 w-full flex-col gap-[5px] overflow-auto">
                {(["all", ...BANDS.map((b) => b.band)] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilters((f) => ({ ...f, band: value }));
                      close();
                    }}
                    className={cn(
                      "w-full rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px]",
                      filters.band === value
                        ? "bg-[#11a8ff] font-semibold text-white"
                        : "border border-[#dce0e6] bg-white text-[#666]"
                    )}
                  >
                    {value === "all" ? "Todas" : value}
                  </button>
                ))}
              </div>
            )}
          </FilterChip>
          <FilterChip
            icon="/embat/icon-filter.svg"
            label="Divisa"
            active={filters.currency !== "all"}
          >
            {(close) => (
              <div className="flex w-full flex-col gap-[5px]">
                {["all", ...currencies].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilters((f) => ({ ...f, currency: value }));
                      close();
                    }}
                    className={cn(
                      "w-full rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px]",
                      filters.currency === value
                        ? "bg-[#11a8ff] font-semibold text-white"
                        : "border border-[#dce0e6] bg-white text-[#666]"
                    )}
                  >
                    {value === "all" ? "Todas" : value}
                  </button>
                ))}
              </div>
            )}
          </FilterChip>
          <FilterChip
            icon="/embat/icon-filter.svg"
            label="Origen"
            active={filters.origin !== "all"}
          >
            {(close) => (
              <div className="flex w-full flex-col gap-[5px]">
                {(
                  [
                    ["all", "Catálogo + import"],
                    ["catalog", "Catálogo"],
                    ["imported", "Importadas"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilters((f) => ({ ...f, origin: value }));
                      close();
                    }}
                    className={cn(
                      "w-full rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px]",
                      filters.origin === value
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
        </div>

        <div>
          <table className="w-full table-fixed border-collapse text-left">
            <caption className="sr-only">Compañías</caption>
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#dce0e6]">
                <th scope="col" className="px-3 py-[15px] pl-5">
                  <span className="sr-only">Seleccionar</span>
                </th>
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
                    className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] whitespace-nowrap text-[#999] last:pr-5"
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
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-4 w-full rounded bg-[#dce0e6]/50" />
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-[14px] text-[#e61847]"
                  >
                    No se han podido cargar las compañías. {error.message}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-[14px] text-[#666]"
                  >
                    Sin compañías que coincidan con el filtro.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const outlook = outlookMeta(row.outlook);
                  const checked = selection.isSelected(row.company_id);
                  const selectDisabled =
                    !checked && selection.count >= MAX_COMPARE;
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
                      <td className="px-3 py-[15px] pl-5">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={selectDisabled}
                          aria-label={`Seleccionar ${row.name}`}
                          className="size-3.5 accent-[#11a8ff]"
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => selection.toggle(row.company_id)}
                        />
                      </td>
                      <td className="truncate px-3 py-[15px] text-[14px] tracking-[-0.14px] text-black">
                        <Link
                          href={`/c/${row.company_id}`}
                          title={row.name}
                          className="block truncate text-black hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.name}
                        </Link>
                        {row.imported ? (
                          <span className="mt-0.5 inline-flex rounded-[4px] border border-[#dce0e6] px-1 py-0 text-[11px] font-medium text-[#666]">
                            Importada
                          </span>
                        ) : null}
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

      {selection.count > 0 ? (
        <div className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-[#dce0e6] bg-white/95 px-4 py-3 shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)] backdrop-blur-md">
          <p className="text-[13px] font-medium tracking-[-0.13px] text-[#666]">
            {selection.count}/{MAX_COMPARE} seleccionadas
            {selection.count < 2 ? " · elige al menos 2" : ""}
          </p>
          <div className="flex items-center gap-2">
            <EmbatButton variant="ghost" onClick={selection.clear}>
              Limpiar
            </EmbatButton>
            <Link
              href={compareHref(selection.values)}
              aria-disabled={selection.count < 2}
              className={cn(
                "inline-flex items-center justify-center rounded-[4px] bg-[#11a8ff] px-2.5 py-1 text-[13px] font-semibold tracking-[-0.13px] text-white",
                selection.count < 2 && "pointer-events-none opacity-50"
              )}
            >
              Comparar
            </Link>
          </div>
        </div>
      ) : null}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={addImported}
        companies={companies}
      />
    </>
  );
}
