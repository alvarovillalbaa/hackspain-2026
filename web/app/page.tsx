"use client";

import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { CompanyCard } from "@/components/xray/company-card";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanies } from "@/hooks/xray/use-companies";
import type { CompanyRef } from "@/lib/xray/types";

export default function PortfolioPage() {
  const { data, loading, addImported } = useCompanies();
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = data.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.company_id.toLowerCase().includes(q) ||
        c.group_id.toLowerCase().includes(q)
    );
    const map = new Map<string, CompanyRef[]>();
    for (const c of filtered) {
      const list = map.get(c.group_id) ?? [];
      list.push(c);
      map.set(c.group_id, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data, query]);

  return (
    <AppShell
      trailing={
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Importar
        </Button>
      }
    >
      <div className="mb-10 space-y-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Portfolio
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Selecciona una empresa del grupo o importa datasets CSV para añadir
          nuevas al demo.
        </p>
        <div className="relative max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, COMP_ o GROUP_"
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : grouped.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Sin empresas</EmptyTitle>
            <EmptyDescription>
              Importa un CSV o limpia el filtro de búsqueda.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setImportOpen(true)}>Importar empresa</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-10">
          {grouped.map(([groupId, companies]) => (
            <section key={groupId} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
                  {groupId}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {companies.length} empresa
                  {companies.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {companies.map((c) => (
                  <CompanyCard key={c.company_id} company={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={addImported}
      />
    </AppShell>
  );
}
