"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  FileText,
  LayoutDashboard,
  ListTodo,
  Settings,
  Users,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSearch } from "@/components/xray/search-context";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useGroups } from "@/hooks/xray/use-groups";
import { outlookMeta } from "@/lib/xray/bands";
import { formatCompactEuro, formatNumber } from "@/lib/xray/format";
import { embatUiClass } from "@/components/embat/font";
import { cn } from "@/lib/utils";

const RECENTS_KEY = "xray-search-recents";
const MAX_RECENTS = 8;

type SearchTipo = "all" | "empresas" | "grupos" | "paginas";

type SearchHit =
  | {
      kind: "company";
      id: string;
      value: string;
      title: string;
      href: string;
      groupId: string;
      score: number | null;
      outlook: string | null;
    }
  | {
      kind: "group";
      id: string;
      value: string;
      title: string;
      href: string;
      nCompanies: number;
      score: number;
      cashClose: number;
      outlook: string;
    }
  | {
      kind: "page";
      id: string;
      value: string;
      title: string;
      href: string;
      description: string;
    };

const PAGES: Extract<SearchHit, { kind: "page" }>[] = [
  {
    kind: "page",
    id: "page-inicio",
    value: "inicio panel dashboard",
    title: "Inicio",
    href: "/",
    description: "KPIs de cartera y vigilancia",
  },
  {
    kind: "page",
    id: "page-empresas",
    value: "empresas compañías companies",
    title: "Empresas",
    href: "/companies",
    description: "Listado y comparación",
  },
  {
    kind: "page",
    id: "page-acciones",
    value: "acciones recomendaciones",
    title: "Acciones",
    href: "/acciones",
    description: "Acciones recomendadas",
  },
  {
    kind: "page",
    id: "page-ajustes",
    value: "ajustes settings slack",
    title: "Ajustes",
    href: "/settings",
    description: "Integraciones y alertas",
  },
];

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

function saveRecent(id: string) {
  if (typeof window === "undefined") return;
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(
    0,
    MAX_RECENTS
  );
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

function hitIcon(hit: SearchHit) {
  if (hit.kind === "company") return Building2;
  if (hit.kind === "group") return Users;
  switch (hit.id) {
    case "page-inicio":
      return LayoutDashboard;
    case "page-empresas":
      return Building2;
    case "page-acciones":
      return ListTodo;
    case "page-ajustes":
      return Settings;
    default:
      return FileText;
  }
}

function SearchPreview({ hit }: { hit: SearchHit | null }) {
  if (!hit) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <SearchPreviewHint />
        <p className="text-sm">Selecciona un resultado para ver el resumen</p>
      </div>
    );
  }

  const Icon = hitIcon(hit);

  if (hit.kind === "company") {
    const outlook = hit.outlook ? outlookMeta(hit.outlook as "positive" | "negative" | "stable") : null;
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{hit.groupId}</p>
          <h3 className="text-lg font-medium tracking-tight text-foreground">
            {hit.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {hit.score != null ? (
            <Badge variant="outline" className="rounded-xl">
              Score {formatNumber(Math.round(hit.score))}
            </Badge>
          ) : null}
          {outlook ? (
            <Badge variant="outline" className="rounded-xl">
              {outlook.label}
            </Badge>
          ) : null}
        </div>
        <p className="mt-auto text-xs text-muted-foreground">{hit.id}</p>
      </div>
    );
  }

  if (hit.kind === "group") {
    const outlook = outlookMeta(hit.outlook as "positive" | "negative" | "stable");
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Grupo empresarial</p>
          <h3 className="text-lg font-medium tracking-tight text-foreground">
            {hit.title}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-lg">
            {hit.nCompanies} empresas
          </Badge>
          <Badge variant="outline" className="rounded-lg">
            Score {formatNumber(Math.round(hit.score))}
          </Badge>
          <Badge variant="outline" className="rounded-lg">
            {formatCompactEuro(hit.cashClose)}
          </Badge>
          <Badge variant="outline" className="rounded-lg">
            {outlook.label}
          </Badge>
        </div>
        <p className="mt-auto text-xs text-muted-foreground">{hit.id}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Página</p>
        <h3 className="text-lg font-medium tracking-tight text-foreground">
          {hit.title}
        </h3>
        <p className="text-sm text-muted-foreground">{hit.description}</p>
      </div>
    </div>
  );
}

function SearchPreviewHint() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <FileText className="size-5" />
    </div>
  );
}

export function SearchDialog() {
  const { open, setOpen } = useSearch();
  const router = useRouter();
  const { data: companies } = useCompanies();
  const { data: summaries } = useCompanySummaries();
  const { data: groups } = useGroups();
  const [tipo, setTipo] = useState<SearchTipo>("all");
  const [selectedValue, setSelectedValue] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecentIds(loadRecents());
  }, [open]);

  const summaryById = useMemo(
    () => new Map(summaries.map((s) => [s.company_id, s] as const)),
    [summaries]
  );

  const companyHits = useMemo((): Extract<SearchHit, { kind: "company" }>[] => {
    return [...companies]
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .map((c) => {
        const s = summaryById.get(c.company_id);
        return {
          kind: "company" as const,
          id: c.company_id,
          value: `${c.name} ${c.company_id} ${c.group_id}`,
          title: c.name,
          href: `/c/${c.company_id}`,
          groupId: c.group_id,
          score: s?.score ?? null,
          outlook: s?.outlook ?? null,
        };
      });
  }, [companies, summaryById]);

  const groupHits = useMemo((): Extract<SearchHit, { kind: "group" }>[] => {
    return [...groups]
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))
      .map((g) => ({
        kind: "group" as const,
        id: g.group_id,
        value: `${g.name} ${g.group_id}`,
        title: g.name,
        href: `/g/${g.group_id}`,
        nCompanies: g.n_companies,
        score: g.score,
        cashClose: g.cash_close,
        outlook: g.outlook,
      }));
  }, [groups]);

  const allHits = useMemo(() => {
    const map = new Map<string, SearchHit>();
    for (const h of companyHits) map.set(h.id, h);
    for (const h of groupHits) map.set(h.id, h);
    for (const h of PAGES) map.set(h.id, h);
    return map;
  }, [companyHits, groupHits]);

  const recentHits = useMemo(() => {
    return recentIds
      .map((id) => allHits.get(id))
      .filter((h): h is SearchHit => h != null);
  }, [recentIds, allHits]);

  const visibleCompanies =
    tipo === "all" || tipo === "empresas" ? companyHits : [];
  const visibleGroups = tipo === "all" || tipo === "grupos" ? groupHits : [];
  const visiblePages = tipo === "all" || tipo === "paginas" ? PAGES : [];
  const showRecents =
    tipo === "all" && recentHits.length > 0 && visibleCompanies.length > 0;

  const selectedHit = useMemo(() => {
    if (!selectedValue) return recentHits[0] ?? visibleCompanies[0] ?? visibleGroups[0] ?? visiblePages[0] ?? null;
    for (const h of allHits.values()) {
      if (h.value === selectedValue || h.id === selectedValue) return h;
    }
    return null;
  }, [
    selectedValue,
    allHits,
    recentHits,
    visibleCompanies,
    visibleGroups,
    visiblePages,
  ]);

  const go = useCallback(
    (hit: SearchHit) => {
      saveRecent(hit.id);
      setOpen(false);
      router.push(hit.href);
    },
    [router, setOpen]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          embatUiClass,
          "top-[12%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar</DialogTitle>
          <DialogDescription>
            Busca empresas, grupos o páginas de X Ray
          </DialogDescription>
        </DialogHeader>
        <Command
          className="rounded-2xl p-0"
          value={selectedValue}
          onValueChange={setSelectedValue}
        >
          <CommandInput
            variant="plain"
            autoFocus
            aria-label="Buscar empresas, grupos o páginas"
            placeholder="Buscar empresas, grupos o páginas…"
          />
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
            <ToggleGroup
              spacing={0}
              variant="default"
              size="sm"
              value={[tipo]}
              onValueChange={(next) => {
                const v = next[0] as SearchTipo | undefined;
                if (v) setTipo(v);
              }}
            >
              <ToggleGroupItem
                value="all"
                className="rounded-xl border-0 bg-transparent text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
              >
                Todo
              </ToggleGroupItem>
              <ToggleGroupItem
                value="empresas"
                className="rounded-xl border-0 bg-transparent text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
              >
                Empresas
              </ToggleGroupItem>
              <ToggleGroupItem
                value="grupos"
                className="rounded-xl border-0 bg-transparent text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
              >
                Grupos
              </ToggleGroupItem>
              <ToggleGroupItem
                value="paginas"
                className="rounded-xl border-0 bg-transparent text-muted-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground"
              >
                Páginas
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid min-h-[360px] max-h-[min(560px,70vh)] grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
            <CommandList className="max-h-none border-r border-border md:max-h-[min(560px,70vh)]">
              <CommandEmpty className="px-4 text-muted-foreground">
                No hay resultados. Prueba otro nombre o identificador, o cambia
                el filtro.
              </CommandEmpty>
              {showRecents ? (
                <CommandGroup heading="Recientes">
                  {recentHits.map((hit) => {
                    const Icon = hitIcon(hit);
                    return (
                      <CommandItem
                        key={`recent-${hit.id}`}
                        value={hit.value}
                        onSelect={() => go(hit)}
                      >
                        <Icon />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {hit.title}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
              {visibleCompanies.length > 0 ? (
                <CommandGroup heading="Empresas">
                  {visibleCompanies.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.value}
                      onSelect={() => go(hit)}
                    >
                      <Building2 />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {hit.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hit.id}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visibleGroups.length > 0 ? (
                <CommandGroup heading="Grupos">
                  {visibleGroups.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.value}
                      onSelect={() => go(hit)}
                    >
                      <Users />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {hit.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {hit.nCompanies} emp.
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {visiblePages.length > 0 ? (
                <CommandGroup heading="Páginas">
                  {visiblePages.map((hit) => {
                    const Icon = hitIcon(hit);
                    return (
                      <CommandItem
                        key={hit.id}
                        value={hit.value}
                        onSelect={() => go(hit)}
                      >
                        <Icon />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {hit.title}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
            </CommandList>
            <div className="hidden bg-muted/30 md:block">
              <SearchPreview hit={selectedHit} />
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
