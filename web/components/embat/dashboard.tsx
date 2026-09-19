"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusClass } from "@/components/embat/chrome";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useWatchQueue } from "@/hooks/xray/use-watch-queue";
import { buildDashboardKpis } from "@/lib/xray/dashboard-kpis";
import { formatCompactEuro, formatNumber } from "@/lib/xray/format";
import { outlookMeta } from "@/lib/xray/bands";
import { cn } from "@/lib/utils";

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-[160px] flex-1 flex-col gap-1 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="text-[13px] font-medium tracking-[-0.13px] text-muted-foreground">
        {label}
      </p>
      <p className="text-[28px] font-medium tracking-[-0.28px] text-black tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const { data: summaries, loading: sumLoading, error: sumError } =
    useCompanySummaries();
  const { data: watch, loading: watchLoading } = useWatchQueue();
  const kpis = useMemo(
    () => buildDashboardKpis(summaries, watch),
    [summaries, watch]
  );
  const loading = sumLoading || watchLoading;
  const maxHist = Math.max(1, ...kpis.histogram.map((h) => h.count));

  return (
    <div className="flex flex-col gap-[30px]">
      {sumError ? (
        <p className="text-[14px] text-destructive">{sumError.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-4">
        {loading ? (
          <>
            <Skeleton className="h-24 w-40 rounded-2xl bg-muted" />
            <Skeleton className="h-24 w-40 rounded-2xl bg-muted" />
            <Skeleton className="h-24 w-40 rounded-2xl bg-muted" />
            <Skeleton className="h-24 w-40 rounded-2xl bg-muted" />
          </>
        ) : (
          <>
            <KpiCard label="Empresas" value={String(kpis.n_companies)} />
            <KpiCard
              label="Score medio"
              value={
                kpis.mean_score == null
                  ? "—"
                  : String(Math.round(kpis.mean_score))
              }
            />
            <KpiCard
              label="Caja agregada"
              value={formatCompactEuro(kpis.cash_close_sum)}
            />
            <KpiCard
              label="Outlook cartera"
              value={`${kpis.outlook.positive}↑`}
              hint={`${kpis.outlook.stable}→ · ${kpis.outlook.negative}↓`}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-stretch gap-[30px]">
        <section className="flex min-w-[280px] flex-1 flex-col gap-3 rounded-2xl border border-border bg-white p-[15px] shadow-sm">
          <h2 className="px-2.5 text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
            Distribución de score
          </h2>
          <div className="flex flex-col gap-2 px-2.5">
            {kpis.histogram.map((h) => (
              <div key={h.bucket} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[12px] font-medium text-muted-foreground">
                  {h.bucket}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(h.count / maxHist) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[12px] tabular-nums text-muted-foreground">
                  {h.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-stretch gap-[30px]">
        <ScoreList
          title="Mejor score"
          rows={kpis.top_scores}
          loading={loading}
        />
        <ScoreList
          title="Peor score"
          rows={kpis.bottom_scores}
          loading={loading}
        />
      </div>
    </div>
  );
}

function ScoreList({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: ReturnType<typeof buildDashboardKpis>["top_scores"];
  loading: boolean;
}) {
  return (
    <section className="flex min-w-[280px] flex-1 flex-col gap-3 rounded-2xl border border-border bg-white p-[15px] shadow-sm">
      <h2 className="px-2.5 text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
        {title}
      </h2>
      {loading ? (
        <Skeleton className="h-24 rounded-xl bg-muted" />
      ) : rows.length === 0 ? (
        <p className="px-2.5 text-[14px] text-muted-foreground">Sin datos.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const outlook = outlookMeta(row.outlook);
            return (
              <li key={row.company_id}>
                <Link
                  href={`/c/${row.company_id}`}
                  className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate text-[14px] text-black">
                    {row.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-xl",
                        statusClass(row.outlook)
                      )}
                    >
                      {formatNumber(Math.round(row.score))}
                    </Badge>
                    <span className="text-[12px] text-muted-foreground">
                      {outlook.label}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
