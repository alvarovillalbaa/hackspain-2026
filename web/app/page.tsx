"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon, SearchIcon } from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { CompanyCard } from "@/components/xray/company-card";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useSelection } from "@/hooks/xray/use-selection";
import { BANDS } from "@/lib/xray/bands";
import { MAX_COMPARE, compareHref } from "@/lib/xray/compare";
import type { Band, CompanyRef } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const ALL = "__all__";

type GroupRow = {
  group_id: string;
  n_companies: number;
};

export default function PortfolioPage() {
  const { data, groupId, loading, refresh, addImported } = useCompanies();
  const selection = useSelection<string>([], MAX_COMPARE);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState(ALL);
  const [currency, setCurrency] = useState(ALL);
  const [origin, setOrigin] = useState(ALL);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/xray/groups", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as {
          groups?: GroupRow[];
        };
        setGroups(json.groups ?? []);
      })
      .catch(() => undefined);
  }, []);

  const switchGroup = useCallback(
    async (next: string) => {
      if (!next || next === groupId) return;
      setGroupBusy(true);
      try {
        const res = await fetch("/api/xray/session", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ group_id: next }),
        });
        if (res.ok) refresh();
      } finally {
        setGroupBusy(false);
      }
    },
    [groupId, refresh]
  );

  const currencies = useMemo(
    () => [...new Set(data.map((c) => c.currency))].sort(),
    [data]
  );

  const companies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.filter((c: CompanyRef) => {
      if (band !== ALL && c.band !== band) return false;
      if (currency !== ALL && c.currency !== currency) return false;
      if (origin === "imported" && !c.imported) return false;
      if (origin === "catalog" && c.imported) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.company_id.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, query, band, currency, origin]);

  return (
    <AppShell
      trailing={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Select
            value={groupId ?? undefined}
            onValueChange={(v) => v && void switchGroup(v)}
            disabled={groupBusy || groups.length === 0}
          >
            <SelectTrigger size="sm" className="w-[9rem]">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.group_id} value={g.group_id}>
                  {g.group_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={band} onValueChange={(v) => v && setBand(v)}>
            <SelectTrigger size="sm" className="w-[7.5rem]">
              <SelectValue>
                {band === ALL ? "Banda" : band}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las bandas</SelectItem>
              {BANDS.map((b) => (
                <SelectItem key={b.band} value={b.band as Band}>
                  {b.band}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
            <SelectTrigger size="sm" className="w-[6.5rem]">
              <SelectValue>
                {currency === ALL ? "Divisa" : currency}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {currencies.map((cur) => (
                <SelectItem key={cur} value={cur}>
                  {cur}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={origin} onValueChange={(v) => v && setOrigin(v)}>
            <SelectTrigger size="sm" className="w-[7.5rem]">
              <SelectValue>
                {origin === ALL
                  ? "Origen"
                  : origin === "imported"
                    ? "Importadas"
                    : "Catálogo"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Catálogo + import</SelectItem>
              <SelectItem value="catalog">Catálogo</SelectItem>
              <SelectItem value="imported">Importadas</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-40 sm:w-52">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Importar
          </Button>
        </div>
      }
    >
      <div className="mb-6 space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Portfolio
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Abre una empresa del grupo, marca hasta {MAX_COMPARE} para compararlas
          o importa un CSV.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : companies.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Sin empresas</EmptyTitle>
            <EmptyDescription>
              Este grupo no tiene empresas (o los filtros las ocultan). Cambia
              de grupo o importa un CSV.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setImportOpen(true)}>Importar empresa</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className={cn("space-y-2", selection.count > 0 && "pb-20")}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {companies.length} empresa{companies.length === 1 ? "" : "s"}
              {groupId ? ` · ${groupId}` : ""}
            </span>
            {groupId ? (
              <Link
                href={`/g/${groupId}`}
                className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
              >
                Ver grupo
              </Link>
            ) : null}
          </div>
          {companies.map((c) => {
            const checked = selection.isSelected(c.company_id);
            return (
              <CompanyCard
                key={c.company_id}
                company={c}
                selected={checked}
                onToggleSelect={() => selection.toggle(c.company_id)}
                selectDisabled={!checked && selection.count >= MAX_COMPARE}
              />
            );
          })}
        </div>
      )}

      {selection.count > 0 ? (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-sm backdrop-blur-md">
          <p className="text-sm text-muted-foreground">
            {selection.count}/{MAX_COMPARE} seleccionadas
            {selection.count < 2 ? " · elige al menos 2" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={selection.clear}>
              Limpiar
            </Button>
            <Link
              href={compareHref(selection.values)}
              aria-disabled={selection.count < 2}
              className={cn(
                buttonVariants({ size: "sm" }),
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
        companies={data}
      />
    </AppShell>
  );
}
