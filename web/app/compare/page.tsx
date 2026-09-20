"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/xray/app-shell";
import {
  DimensionsPanel,
  ScoreColumn,
  TrajectoryPanel,
} from "@/components/xray/score-overview";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/xray/feedback-state";
import { embatFocusRing } from "@/components/embat/chrome";
import { useCompanyScores } from "@/hooks/xray/use-company-scores";
import { useCompanies } from "@/hooks/xray/use-companies";
import { usePeerCohorts } from "@/hooks/xray/use-peers";
import { COMPARE_COLORS, parseCompareIds } from "@/lib/xray/compare";
import { cn } from "@/lib/utils";

function BackToCompanies() {
  return (
    <Link
      href="/companies"
      className={cn(
        "inline-flex h-9 items-center rounded-xl bg-primary px-3 text-[14px] font-medium tracking-[-0.14px] text-primary-foreground transition-colors duration-150 ease-out hover:bg-primary/80 motion-reduce:transition-none",
        embatFocusRing
      )}
    >
      Ir a Empresas
    </Link>
  );
}

function CompareInner() {
  const searchParams = useSearchParams();
  const ids = parseCompareIds(searchParams.get("ids"));
  const { data: snapshots, loading } = useCompanyScores(ids);
  const { data: cohorts, loading: peersLoading } = usePeerCohorts(ids);
  const { data: companies } = useCompanies();

  const rows = snapshots.map((snapshot, i) => {
    const company = companies.find((c) => c.company_id === snapshot.company_id);
    return {
      snapshot,
      name: company?.name ?? snapshot.company_id,
      currency: company?.currency ?? "EUR",
      peers: cohorts.find((c) => c.company_id === snapshot.company_id) ?? null,
      color: COMPARE_COLORS[i] ?? COMPARE_COLORS[0],
    };
  });

  return (
    <AppShell crumbs={[{ label: "Comparar" }]}>
      {ids.length < 2 ? (
        <EmptyState
          placement="page"
          title="Elige 2 o 3 empresas para comparar"
          description="En Empresas, marca dos o tres compañías con la casilla de la izquierda y pulsa Comparar. Verás sus bandas, dimensiones y trayectorias lado a lado."
          action={<BackToCompanies />}
        />
      ) : loading || peersLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl bg-muted" />
          <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
        </div>
      ) : rows.length < 2 ? (
        <EmptyState
          placement="page"
          title="Sin score para esas empresas"
          description="Ninguna de las compañías seleccionadas tiene score disponible. Prueba con otras dos o tres."
          action={<BackToCompanies />}
        />
      ) : (
        <div className="space-y-10">
          <div
            className={cn(
              "grid items-start gap-8",
              rows.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"
            )}
          >
            {rows.map((row) => (
              <ScoreColumn
                key={row.snapshot.company_id}
                snapshot={row.snapshot}
                title={
                  <Link
                    href={`/c/${row.snapshot.company_id}`}
                    className="hover:underline"
                  >
                    {row.name}
                  </Link>
                }
                peers={row.peers}
                currency={row.currency}
                color={row.color}
                layout="stack"
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DimensionsPanel
              series={rows.map((row) => ({
                name: row.name,
                dimensions: row.snapshot.dimensions,
                color: row.color,
              }))}
            />
            <TrajectoryPanel
              series={rows.map((row) => ({
                name: row.name,
                history: row.snapshot.history,
                color: row.color,
              }))}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <CompareInner />
    </Suspense>
  );
}
