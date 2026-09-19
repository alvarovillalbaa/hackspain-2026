"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_GROUP_ID } from "@/lib/xray/demo";

type GroupRow = {
  group_id: string;
  n_companies: number;
  company_ids: string[];
  score_min: number | null;
  score_max: number | null;
};

type GroupsResponse = {
  active_group_id: string;
  groups: GroupRow[];
};

export function StartPage() {
  const router = useRouter();
  const [data, setData] = useState<GroupsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/xray/groups", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<GroupsResponse>;
      })
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Error al cargar grupos")
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.groups;
    return data.groups.filter(
      (g) =>
        g.group_id.toLowerCase().includes(q) ||
        g.company_ids.some((id) => id.toLowerCase().includes(q))
    );
  }, [data, query]);

  async function selectGroup(groupId: string) {
    setBusy(groupId);
    setError(null);
    try {
      const res = await fetch("/api/xray/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      router.push(`/g/${groupId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fijar el grupo");
      setBusy(null);
    }
  }

  async function resetDefault() {
    await selectGroup(DEFAULT_GROUP_ID);
  }

  async function clearGroupState() {
    if (!data) return;
    setBusy("clear");
    setError(null);
    try {
      const res = await fetch("/api/xray/session/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: data.active_group_id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo limpiar");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Operador · noindex
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Foco de la demo
        </h1>
        <p className="text-sm text-muted-foreground">
          Grupos y compañías listan todo el fact pack. Aquí fijas el grupo
          compartido en Blob: reset de deals/acciones y el default{" "}
          <span className="font-mono">{DEFAULT_GROUP_ID}</span>. Al elegir se
          abre su ficha.
        </p>
        {data ? (
          <p className="text-sm">
            Foco:{" "}
            <Badge variant="secondary" className="font-mono">
              {data.active_group_id}
            </Badge>
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={resetDefault}
        >
          Volver a {DEFAULT_GROUP_ID}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(busy) || !data}
          onClick={clearGroupState}
        >
          Limpiar deals + actions del grupo
        </Button>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar GROUP_ o COMP_"
          className="pl-9"
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {!data ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {filtered.map((g) => {
            const active = g.group_id === data.active_group_id;
            const scoreLabel =
              g.score_min != null && g.score_max != null
                ? g.score_min === g.score_max
                  ? `score ${g.score_min.toFixed(0)}`
                  : `score ${g.score_min.toFixed(0)}–${g.score_max.toFixed(0)}`
                : "sin score";
            return (
              <li key={g.group_id}>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => selectGroup(g.group_id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">
                        {g.group_id}
                      </span>
                      {active ? (
                        <Badge className="text-[10px]">foco</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.n_companies} empresa{g.n_companies === 1 ? "" : "s"} ·{" "}
                      {scoreLabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {busy === g.group_id ? "…" : "Fijar y abrir"}
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ningún grupo coincide.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
