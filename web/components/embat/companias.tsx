"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  EmbatIcon,
  FilterChip,
  FilterField,
  statusClass,
} from "@/components/embat/chrome";
import { useSearch } from "@/components/xray/search-context";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useSelection } from "@/hooks/xray/use-selection";
import { outlookMeta } from "@/lib/xray/bands";
import type { CompanySummary } from "@/lib/xray/company-summary";
import { MAX_COMPARE, compareHref } from "@/lib/xray/compare";
import {
  formatCompactEuro,
  formatRatePct,
} from "@/lib/xray/format";
import type { Outlook } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

type OutlookFilter = Outlook | "all";
type OriginFilter = "all" | "catalog" | "imported";

interface Filters {
  name: string;
  minScore: number | null;
  outlook: OutlookFilter;
  minRate: number | null;
  minCash: number | null;
  currency: string;
  origin: OriginFilter;
}

const EMPTY_FILTERS: Filters = {
  name: "",
  minScore: null,
  outlook: "all",
  minRate: null,
  minCash: null,
  currency: "all",
  origin: "all",
};

type TableRow = CompanySummary & {
  currency: string;
  imported?: boolean;
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

function matchesFilters(row: TableRow, filters: Filters): boolean {
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
  if (filters.currency !== "all" && row.currency !== filters.currency) {
    return false;
  }
  if (filters.origin === "imported" && !row.imported) return false;
  if (filters.origin === "catalog" && row.imported) return false;
  return true;
}

function FilterOptionButtons({
  options,
  value,
  onSelect,
}: {
  options: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className="w-full justify-start rounded-xl"
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function CompaniasToolbar({
  filters,
  setFilters,
  currencies,
  onImport,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  currencies: string[];
  onImport: () => void;
}): ReactNode {
  const { openSearch } = useSearch();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
          <FilterOptionButtons
            value={filters.outlook}
            options={[
              { value: "all", label: "Todos" },
              { value: "positive", label: outlookMeta("positive").label },
              { value: "stable", label: outlookMeta("stable").label },
              { value: "negative", label: outlookMeta("negative").label },
            ]}
            onSelect={(value) => {
              setFilters((f) => ({
                ...f,
                outlook: value as OutlookFilter,
              }));
              close();
            }}
          />
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
              filters.minRate != null ? String(filters.minRate * 100) : ""
            }
            inputMode="decimal"
            onApply={(value) => {
              const n = Number(value.replace(",", "."));
              setFilters((f) => ({
                ...f,
                minRate: value.trim() && Number.isFinite(n) ? n / 100 : null,
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
        label="Divisa"
        active={filters.currency !== "all"}
      >
        {(close) => (
          <FilterOptionButtons
            value={filters.currency}
            options={[
              { value: "all", label: "Todas" },
              ...currencies.map((c) => ({ value: c, label: c })),
            ]}
            onSelect={(value) => {
              setFilters((f) => ({ ...f, currency: value }));
              close();
            }}
          />
        )}
      </FilterChip>
      <FilterChip
        icon="/embat/icon-filter.svg"
        label="Origen"
        active={filters.origin !== "all"}
      >
        {(close) => (
          <FilterOptionButtons
            value={filters.origin}
            options={[
              { value: "all", label: "Catálogo + import" },
              { value: "catalog", label: "Catálogo" },
              { value: "imported", label: "Importadas" },
            ]}
            onSelect={(value) => {
              setFilters((f) => ({
                ...f,
                origin: value as OriginFilter,
              }));
              close();
            }}
          />
        )}
      </FilterChip>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-xl"
        aria-label="Buscar empresa"
        onClick={openSearch}
      >
        <SearchIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-xl"
        onClick={onImport}
      >
        <EmbatIcon src="/embat/icon-import.svg" />
        Importar
      </Button>
    </div>
  );
}

export function useCompaniasState() {
  const { data, loading, error } = useCompanySummaries();
  const { data: companies, addImported } = useCompanies();
  const selection = useSelection<string>([], MAX_COMPARE);
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
      };
    });
  }, [data, companies, byCompany]);

  const rows = useMemo(
    () => merged.filter((c) => matchesFilters(c, filters)),
    [merged, filters]
  );

  return {
    rows,
    loading,
    error,
    selection,
    filters,
    setFilters,
    currencies,
    companies,
    addImported,
    importOpen,
    setImportOpen,
  };
}

export function Companias({
  className,
  state,
}: {
  className?: string;
  state: ReturnType<typeof useCompaniasState>;
}) {
  const router = useRouter();
  const {
    rows,
    loading,
    error,
    selection,
    companies,
    addImported,
    importOpen,
    setImportOpen,
  } = state;

  return (
    <div className={cn("flex w-full flex-col", className)}>
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <p className="py-8 text-sm text-destructive">
          No se han podido cargar las compañías. {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Sin compañías que coincidan con el filtro.
        </p>
      ) : (
        <ItemGroup className="gap-0">
          {rows.map((row, i) => {
            const outlook = outlookMeta(row.outlook);
            const checked = selection.isSelected(row.company_id);
            const selectDisabled =
              !checked && selection.count >= MAX_COMPARE;
            return (
              <div key={row.company_id}>
                {i > 0 ? <ItemSeparator className="my-0" /> : null}
                <Item
                  size="sm"
                  className="cursor-pointer rounded-none border-0 px-0 py-3 hover:bg-muted/50"
                  onClick={() => router.push(`/c/${row.company_id}`)}
                >
                  <div
                    className="flex shrink-0 items-center pr-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={selectDisabled}
                      aria-label={`Seleccionar ${row.name}`}
                      onCheckedChange={() =>
                        selection.toggle(row.company_id)
                      }
                    />
                  </div>
                  <ItemContent>
                    <ItemTitle className="text-[15px]">{row.name}</ItemTitle>
                    <ItemDescription>
                      <Link
                        href={`/g/${row.group_id}`}
                        className="text-primary hover:text-primary/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.group_id}
                      </Link>
                      {row.imported ? " · Importada" : null}
                      {" · "}
                      {row.situation}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-wrap justify-end gap-2">
                    <Badge
                      variant="outline"
                      className={cn("rounded-xl", statusClass(row.outlook))}
                    >
                      {Math.round(row.score)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("rounded-xl", statusClass(row.outlook))}
                    >
                      {outlook.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {formatRatePct(row.implied_rate)}
                    </span>
                    <span className="min-w-[4.5rem] text-right text-sm tabular-nums">
                      {formatCompactEuro(row.cash_close)}
                    </span>
                  </ItemActions>
                </Item>
              </div>
            );
          })}
        </ItemGroup>
      )}

      {selection.count > 0 ? (
        <div className="sticky bottom-4 z-30 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-sm backdrop-blur-md">
          <p className="text-sm text-muted-foreground">
            {selection.count}/{MAX_COMPARE} seleccionadas
            {selection.count < 2 ? " · elige al menos 2" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selection.clear}>
              Limpiar
            </Button>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={selection.count < 2}
              render={
                <Link
                  href={
                    selection.count >= 2
                      ? compareHref(selection.values)
                      : "#"
                  }
                />
              }
            >
              Comparar
            </Button>
          </div>
        </div>
      ) : null}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={addImported}
        companies={companies}
      />
    </div>
  );
}
