"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { ErrorState } from "@/components/xray/feedback-state";
import { QueryFilterBar } from "@/components/xray/query-filter-bar";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/xray/sortable-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmbatIcon, statusClass } from "@/components/embat/chrome";
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
import {
  applyQueryFilters,
  type QueryFilterRule,
} from "@/lib/xray/query-filters";
import { cn } from "@/lib/utils";

type TableRow = CompanySummary & {
  currency: string;
  imported?: boolean;
  origin: "catalog" | "imported";
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

const COMPANY_FILTER_FIELDS = [
  { id: "name", label: "Nombre", type: "string" as const },
  { id: "score", label: "Puntuación", type: "number" as const },
  {
    id: "outlook",
    label: "Estado",
    type: "enum" as const,
    options: [
      { value: "positive", label: outlookMeta("positive").label },
      { value: "stable", label: outlookMeta("stable").label },
      { value: "negative", label: outlookMeta("negative").label },
    ],
  },
  { id: "implied_rate", label: "Tipo", type: "number" as const },
  { id: "cash_close", label: "Caja", type: "number" as const },
  { id: "currency", label: "Divisa", type: "string" as const },
  {
    id: "origin",
    label: "Origen",
    type: "enum" as const,
    options: [
      { value: "catalog", label: "Catálogo" },
      { value: "imported", label: "Importada" },
    ],
  },
];

export function CompaniasToolbar({
  rules,
  setRules,
  onImport,
}: {
  rules: QueryFilterRule[];
  setRules: React.Dispatch<React.SetStateAction<QueryFilterRule[]>>;
  currencies: string[];
  onImport: () => void;
}): ReactNode {
  const { openSearch } = useSearch();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <QueryFilterBar
        fields={COMPANY_FILTER_FIELDS}
        rules={rules}
        onChange={setRules}
      />
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
  const [rules, setRules] = useState<QueryFilterRule[]>([]);
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
      const imported = Boolean(ref?.imported);
      return {
        ...row,
        currency: ref?.currency ?? "EUR",
        imported,
        origin: imported ? ("imported" as const) : ("catalog" as const),
      };
    });
  }, [data, companies, byCompany]);

  const rows = useMemo(
    () =>
      applyQueryFilters(
        merged as unknown as Record<string, unknown>[],
        rules
      ) as unknown as TableRow[],
    [merged, rules]
  );

  return {
    rows,
    loading,
    error,
    selection,
    rules,
    setRules,
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

  const columns: SortableColumn<TableRow>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Empresa",
        sortKey: "name",
        cell: (row) => (
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-[12px] text-muted-foreground">
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
            </div>
          </div>
        ),
      },
      {
        id: "score",
        header: "Score",
        sortKey: "score",
        align: "right",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn("rounded-xl", statusClass(row.outlook))}
          >
            {Math.round(row.score)}
          </Badge>
        ),
      },
      {
        id: "outlook",
        header: "Estado",
        sortKey: "outlook",
        cell: (row) => (
          <Badge
            variant="outline"
            className={cn("rounded-xl", statusClass(row.outlook))}
          >
            {outlookMeta(row.outlook).label}
          </Badge>
        ),
      },
      {
        id: "rate",
        header: "Tipo",
        sortKey: "implied_rate",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums text-muted-foreground">
            {formatRatePct(row.implied_rate)}
          </span>
        ),
      },
      {
        id: "cash",
        header: "Caja",
        sortKey: "cash_close",
        align: "right",
        cell: (row) => (
          <span className="tabular-nums">
            {formatCompactEuro(row.cash_close)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className={cn("flex w-full flex-col", className)}>
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="No se han podido cargar las compañías"
          description={error.message}
          placement="page"
        />
      ) : (
        <SortableTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.company_id}
          defaultSortKey="score"
          onRowClick={(row) => router.push(`/c/${row.company_id}`)}
          leading={(row) => {
            const checked = selection.isSelected(row.company_id);
            const selectDisabled =
              !checked && selection.count >= MAX_COMPARE;
            return (
              <Checkbox
                checked={checked}
                disabled={selectDisabled}
                aria-label={`Seleccionar ${row.name}`}
                onCheckedChange={() => selection.toggle(row.company_id)}
              />
            );
          }}
          empty={
            <ErrorState
              title="Sin compañías"
              description="Sin compañías que coincidan con el filtro."
              placement="card"
              className="[&_[data-slot=empty-icon]]:hidden"
            />
          }
        />
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
