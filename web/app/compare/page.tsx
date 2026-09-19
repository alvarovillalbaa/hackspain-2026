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
import { useCompanyScores } from "@/hooks/xray/use-company-scores";
import { useCompanies } from "@/hooks/xray/use-companies";
import { usePeerCohorts } from "@/hooks/xray/use-peers";
import { COMPARE_COLORS, parseCompareIds } from "@/lib/xray/compare";
import { cn } from "@/lib/utils";

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
        <div className="space-y-3">
          <p className="text-[14px] text-muted-foreground">
            Elige 2 o 3 empresas en Empresas.
          </p>
          <Link
            href="/companies"
            className="inline-flex rounded-xl bg-primary px-2.5 py-1 text-[13px] font-semibold tracking-[-0.13px] text-primary-foreground"
          >
            Volver a empresas
          </Link>
        </div>
      ) : loading || peersLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl bg-muted" />
          <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
        </div>
      ) : rows.length < 2 ? (
        <div className="space-y-3">
          <p className="text-[14px] text-muted-foreground">
            No hay score para esas empresas.
          </p>
          <Link
            href="/companies"
            className="inline-flex rounded-xl bg-primary px-2.5 py-1 text-[13px] font-semibold tracking-[-0.13px] text-primary-foreground"
          >
            Volver a empresas
          </Link>
        </div>
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
