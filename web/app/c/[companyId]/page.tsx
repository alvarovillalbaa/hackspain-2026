"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreBandBadge, OutlookBadge } from "@/components/xray/score-band-badge";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { DriverList } from "@/components/xray/driver-list";
import { ActionCard } from "@/components/xray/action-card";
import { ScoreUplift } from "@/components/xray/score-uplift";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { watchMeta } from "@/lib/xray/bands";
import { formatCurrency, formatMonth } from "@/lib/xray/format";
import { clearDealsForCompanies, fetchDeal } from "@/lib/xray/deals";
import { onDataImported } from "@/lib/xray/import-events";
import type { AcceptedDeal, DimensionKey, Dimensions } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const DIM_LABELS: Record<DimensionKey, string> = {
  liquidity: "Liquidez",
  collections: "Cobros",
  payments: "Pagos",
  debt: "Deuda",
  activity: "Actividad",
};

const DIM_REASON: Record<DimensionKey, string> = {
  liquidity:
    "Liquidez: capacidad de cubrir salidas con caja (cash buffer days y rangos de saldo).",
  collections:
    "Cobros: calidad del circulante emitido (overdue / aging de facturas emitidas).",
  payments:
    "Pagos: disciplina con proveedores (overdue / pending de facturas recibidas).",
  debt: "Deuda: servicio de la deuda y apalancamiento (DSCR y carga financiera).",
  activity:
    "Actividad: ritmo operativo (ratio de flujos netos y nivel de movimiento).",
};

const DIM_KEYS = Object.keys(DIM_LABELS) as DimensionKey[];

function ScorePageInner({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const { data: score, loading } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies, addImported } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const [importOpen, setImportOpen] = useState(false);
  const [deal, setDeal] = useState<AcceptedDeal | null>(null);
  const [gaugeView, setGaugeView] = useState<"health" | "dimensions">("health");

  useEffect(() => {
    let cancelled = false;
    void fetchDeal(companyId).then((d) => {
      if (!cancelled) setDeal(d);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, searchParams]);

  useEffect(() => {
    return onDataImported((ids) => {
      void clearDealsForCompanies(ids.length ? ids : [companyId]).then(() => {
        if (ids.length === 0 || ids.includes(companyId)) {
          void fetchDeal(companyId).then(setDeal);
        }
      });
    });
  }, [companyId]);

  const closed = Boolean(deal) || searchParams.get("closed") === "1";
  const watch = watchMeta(score?.watch ?? null);

  return (
    <AppShell
      crumbs={[
        {
          label: company?.name ?? companyId,
          href: `/c/${companyId}`,
        },
      ]}
      trailing={
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <UploadIcon data-icon="inline-start" />
          Actualizar datos
        </Button>
      }
    >
      {loading || !score ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>
              {score.company_id} · {formatMonth(score.month)}
            </span>
            <span>·</span>
            <span>
              confianza {score.confidence} · peer p{score.peer_percentile}
            </span>
          </div>

          {deal ? (
            <Alert>
              <AlertTitle>Oferta aceptada</AlertTitle>
              <AlertDescription>
                <span className="block">
                  {deal.label} · {deal.issuer_name} ·{" "}
                  {formatCurrency(deal.amount, company?.currency ?? "EUR")}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    Impacto what-if (no recalcula el Health Score oficial):
                  </span>
                  <ScoreUplift
                    uplift={deal.uplift}
                    toBand={deal.projected_band}
                  />
                </span>
              </AlertDescription>
            </Alert>
          ) : closed ? (
            <Alert>
              <AlertTitle>Oferta cerrada</AlertTitle>
              <AlertDescription>
                La solicitud se aprobó. No hay más acciones recomendadas en esta
                ficha.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={gaugeView === "health" ? "default" : "outline"}
              onClick={() => setGaugeView("health")}
            >
              Health Score
            </Button>
            <Button
              size="sm"
              variant={gaugeView === "dimensions" ? "default" : "outline"}
              onClick={() => setGaugeView("dimensions")}
            >
              Dimensiones
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(14rem,1fr)_1fr_1fr]">
            <div className="flex flex-col items-center gap-3">
              {gaugeView === "health" ? (
                <>
                  <ScoreGauge
                    score={score.score}
                    band={score.band}
                    reasoning={score.explanation}
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <ScoreBandBadge band={score.band} />
                    <OutlookBadge outlook={score.outlook} />
                    {watch.active ? (
                      <Badge variant="destructive">Watch</Badge>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {DIM_KEYS.map((key) => (
                    <ScoreGauge
                      key={key}
                      score={(score.dimensions as Dimensions)[key] * 100}
                      label={DIM_LABELS[key]}
                      reasoning={`${DIM_REASON[key]} Valor: ${((score.dimensions as Dimensions)[key] * 100).toFixed(0)}/100.`}
                      size="sm"
                    />
                  ))}
                </div>
              )}
            </div>

            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Sub-scores</CardTitle>
                  <ReasoningHint
                    text={`Bankability = 40% liquidez + 35% deuda + 25% pagos. Business = 45% cobros + 55% actividad. Derivados de las dimensiones, no del mapa isotónico.`}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={score.sub_scores.bankability}>
                  <ProgressLabel className="text-xs">Bankability</ProgressLabel>
                  <ProgressValue />
                </Progress>
                <Progress value={score.sub_scores.business_profile}>
                  <ProgressLabel className="text-xs">Business</ProgressLabel>
                  <ProgressValue />
                </Progress>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Drivers</CardTitle>
              </CardHeader>
              <CardContent>
                <DriverList drivers={score.drivers} />
              </CardContent>
            </Card>
          </div>

          {watch.active ? (
            <Alert>
              <AlertTitle>Watch activo</AlertTitle>
              <AlertDescription>{watch.description}</AlertDescription>
            </Alert>
          ) : null}
          {score.alerts.map((a) => (
            <Alert key={a.id} variant="destructive">
              <AlertTitle>{a.severity}</AlertTitle>
              <AlertDescription>{a.message}</AlertDescription>
            </Alert>
          ))}

          <div
            className={cn(
              "grid gap-6",
              closed
                ? "lg:grid-cols-1"
                : "lg:grid-cols-[minmax(16rem,22rem)_1fr]"
            )}
          >
            {!closed ? (
              <section className="space-y-3">
                <h2 className="font-heading text-sm font-medium">
                  Acciones recomendadas
                </h2>
                <div className="flex flex-col gap-3">
                  {actionsLoading ? (
                    <>
                      <Skeleton className="h-28 rounded-2xl" />
                      <Skeleton className="h-28 rounded-2xl" />
                    </>
                  ) : actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ninguna acción recomendada para esta empresa.
                    </p>
                  ) : (
                    actions.map((a) => (
                      <ActionCard
                        key={a.id}
                        action={a}
                        snapshot={score}
                        currency={company?.currency ?? "EUR"}
                        href={`/c/${companyId}/a/${a.id}`}
                      />
                    ))
                  )}
                </div>
              </section>
            ) : null}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Trayectoria</CardTitle>
                  <ReasoningHint
                    text="Histórico mensual del Health Score más abanico a 6 meses (p10 / p50 / p90). El abanico es el mismo forecast que antes ocupaba la tarjeta Proyección 6m."
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ScoreTrajectory
                  history={score.history}
                  projection={score.projection_6m}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(imported) => {
          addImported(imported);
        }}
        targetCompanyId={companyId}
        companies={companies}
      />
    </AppShell>
  );
}

export default function ScorePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <ScorePageInner companyId={companyId} />
    </Suspense>
  );
}
