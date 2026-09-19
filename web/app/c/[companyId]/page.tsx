"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/xray/app-shell";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreBandBadge, OutlookBadge } from "@/components/xray/score-band-badge";
import { DimensionRadar } from "@/components/xray/dimension-radar";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { DriverList } from "@/components/xray/driver-list";
import { ActionCard } from "@/components/xray/action-card";
import { OriginChip } from "@/components/xray/origin-chip";
import { ScoreUplift } from "@/components/xray/score-uplift";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useSelection } from "@/hooks/xray/use-selection";
import { publishedProjectionMany } from "@/lib/xray/scoring";
import { watchMeta } from "@/lib/xray/bands";
import { formatMonth } from "@/lib/xray/format";

export default function ScorePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const { data: score, loading } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const selection = useSelection<string>();
  const selectedIds = selection.values;

  const combined = useMemo(() => {
    if (!score) return null;
    const selected = actions.filter((a) => selectedIds.includes(a.id));
    if (selected.length === 0) return null;
    return publishedProjectionMany(score, selected);
  }, [score, actions, selectedIds]);

  const watch = watchMeta(score?.watch ?? null);

  return (
    <AppShell
      crumbs={[
        {
          label: company?.name ?? companyId,
          href: `/c/${companyId}`,
        },
      ]}
    >
      {loading || !score ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <OriginChip origin={score.origin} />
                <span className="font-mono text-xs text-muted-foreground">
                  {score.company_id} · {formatMonth(score.month)}
                </span>
              </div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                {company?.name ?? companyId}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Financial Health Score · confianza {score.confidence} · peer p
                {score.peer_percentile}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ScoreBandBadge band={score.band} />
              <OutlookBadge outlook={score.outlook} />
              {watch.active ? (
                <Badge variant="destructive">Watch</Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <ScoreGauge score={score.score} band={score.band} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Sub-scores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 font-mono tabular-nums">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Bankability</span>
                    <span>{score.sub_scores.bankability}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Business</span>
                    <span>{score.sub_scores.business_profile}</span>
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Proyección 6m</CardTitle>
                  <CardDescription>p10 / p50 / p90</CardDescription>
                </CardHeader>
                <CardContent className="font-mono text-sm tabular-nums">
                  {score.projection_6m.p10.toFixed(1)} ·{" "}
                  {score.projection_6m.p50.toFixed(1)} ·{" "}
                  {score.projection_6m.p90.toFixed(1)}
                </CardContent>
              </Card>
              {watch.active ? (
                <Alert className="sm:col-span-2">
                  <AlertTitle>Watch activo</AlertTitle>
                  <AlertDescription>{watch.description}</AlertDescription>
                </Alert>
              ) : null}
              {score.alerts.map((a) => (
                <Alert key={a.id} className="sm:col-span-2" variant="destructive">
                  <AlertTitle>{a.severity}</AlertTitle>
                  <AlertDescription>{a.message}</AlertDescription>
                </Alert>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Dimensiones</CardTitle>
                <CardDescription>
                  Liquidez · Cobros · Pagos · Deuda · Actividad
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DimensionRadar dimensions={score.dimensions} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Trayectoria</CardTitle>
                <CardDescription>Histórico + abanico a 6 meses</CardDescription>
              </CardHeader>
              <CardContent>
                <ScoreTrajectory
                  history={score.history}
                  projection={score.projection_6m}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Drivers</CardTitle>
              <CardDescription>Señales que mueven el score</CardDescription>
            </CardHeader>
            <CardContent>
              <DriverList drivers={score.drivers} />
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold">
                  Acciones recomendadas
                </h2>
                <p className="text-sm text-muted-foreground">
                  {actionsLoading
                    ? "El agente está calculando las acciones…"
                    : "Selecciona una o varias; el score se recálcula con las mismas reglas."}
                </p>
              </div>
              {combined ? (
                <ScoreUplift
                  from={combined.before}
                  to={combined.after}
                  uplift={combined.uplift}
                  toBand={combined.toBand}
                />
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {actionsLoading ? (
                <>
                  <Skeleton className="h-40 rounded-2xl" />
                  <Skeleton className="h-40 rounded-2xl" />
                </>
              ) : actions.length === 0 ? (
                <p className="text-sm text-muted-foreground md:col-span-2">
                  Ninguna acción recomendada para esta empresa.
                </p>
              ) : (
                actions.map((a) => (
                  <ActionCard
                    key={a.id}
                    action={a}
                    snapshot={score}
                    currency={company?.currency ?? "EUR"}
                    selected={selection.isSelected(a.id)}
                    onToggle={() => selection.toggle(a.id)}
                    href={`/c/${companyId}/a/${a.id}`}
                  />
                ))
              )}
            </div>
            {selection.count === 1 ? (
              <p className="text-sm">
                <Link
                  href={`/c/${companyId}/a/${selection.values[0]}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Abrir marketplace de la acción seleccionada →
                </Link>
              </p>
            ) : null}
          </section>
        </div>
      )}
    </AppShell>
  );
}
