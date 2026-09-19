"use client";

import { useState, type ReactNode } from "react";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreBandBadge, OutlookBadge } from "@/components/xray/score-band-badge";
import { DimensionRadar, type RadarSeries } from "@/components/xray/dimension-radar";
import {
  ScoreTrajectory,
  type TrajectorySeries,
} from "@/components/xray/score-trajectory";
import { DriverList } from "@/components/xray/driver-list";
import { PeerCohortCard } from "@/components/xray/peer-cohort-card";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { watchMeta } from "@/lib/xray/bands";
import { formatCurrency, formatDelta, formatMonth, formatNumber, formatPercent } from "@/lib/xray/format";
import type { PeerCohort } from "@/lib/xray/peers";
import type {
  DimensionKey,
  Dimensions,
  Driver,
  Projection6m,
  ScoreSnapshot,
  SubScores,
  TreasuryProjection,
} from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const DIMENSION_KEYS: DimensionKey[] = [
  "liquidity",
  "collections",
  "payments",
  "debt",
  "activity",
];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  liquidity: "Liquidez",
  collections: "Cobros",
  payments: "Pagos",
  debt: "Deuda",
  activity: "Actividad",
};

type GaugeMode = "score" | "dimensions";

export function scoreSubtitle(
  snapshot: ScoreSnapshot,
  peers?: PeerCohort | null
): string {
  if (peers && peers.k > 0) {
    return `Índice de salud · confianza ${snapshot.confidence} · ${formatDelta(peers.delta)} vs ${peers.k} similares`;
  }
  return `Índice de salud · confianza ${snapshot.confidence} · peer p${snapshot.peer_percentile}`;
}

function subScoreReasoning(label: string, value: number): string {
  return `${label}: ${formatNumber(value)} / 100. Componente del índice de salud (no es el mapa isotónico).`;
}

function dimensionReasoning(key: DimensionKey, value: number): string {
  const pts = Math.round(value * 100);
  return `${DIMENSION_LABELS[key]}: ${pts} / 100. Dimensión normalizada del fact pack.`;
}

function trajectoryReasoning(
  snapshot: ScoreSnapshot,
  projection?: Projection6m
): string {
  const trend =
    snapshot.trend === "improving"
      ? "mejora"
      : snapshot.trend === "worsening"
        ? "empeora"
        : "se mantiene";
  const base = `Tendencia ${trend}. Outlook ${snapshot.outlook}.`;
  if (!projection) return base;
  return `${base} Forecast 6m: p10 ${projection.p10.toFixed(1)}, p50 ${projection.p50.toFixed(1)}, p90 ${projection.p90.toFixed(1)}.`;
}

export function SubScoresCard({ subScores }: { subScores: SubScores }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Desglose</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={subScores.bankability}>
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Financiabilidad</ProgressLabel>
            <ReasoningHint
              text={subScoreReasoning("Financiabilidad", subScores.bankability)}
            />
            <ProgressValue />
          </div>
        </Progress>
        <Progress value={subScores.business_profile}>
          <div className="flex w-full items-center gap-2">
            <ProgressLabel>Perfil de negocio</ProgressLabel>
            <ReasoningHint
              text={subScoreReasoning(
                "Perfil de negocio",
                subScores.business_profile
              )}
            />
            <ProgressValue />
          </div>
        </Progress>
      </CardContent>
    </Card>
  );
}

export function TreasuryCard({ treasury }: { treasury: TreasuryProjection }) {
  const { baseline, recommended, currency, cash_projection_6m: cash } = treasury;
  const labels: Record<TreasuryProjection["recommended"]["kind"], string> = {
    none: "No actuar",
    line_draw: "Disponer de la línea existente",
    line_cover: "Cubrir descubiertos con la línea existente",
    line_open: "Abrir una línea de crédito",
    factoring: "Anticipar facturas elegibles",
    loan: "Solicitar un préstamo",
    refinance: "Refinanciar el préstamo",
  };
  const amount = recommended.kind === "factoring"
    ? `${formatPercent(recommended.amount)} de la cartera elegible`
    : recommended.amount > 0 ? formatCurrency(recommended.amount, currency) : null;
  const rows = [
    ["Coste financiero (6m)", formatCurrency(baseline.expected_cost, currency), formatCurrency(recommended.expected_cost, currency)],
    ["Saldo mínimo negativo", formatPercent(baseline.breach_prob), formatPercent(recommended.breach_prob)],
    [`DSCR agregado < ${formatNumber(treasury.dscr_floor)}`, formatPercent(baseline.dscr_fail_prob), formatPercent(recommended.dscr_fail_prob)],
  ];
  return (
    <Card size="sm" className="sm:col-span-2">
      <CardHeader>
        <CardTitle>Simulación de tesorería · {treasury.horizon_months}m</CardTitle>
        <CardDescription>
          MPC · {treasury.n_paths} trayectorias · {treasury.history_months} meses de flujos propios
          {treasury.uses_pool ? " + referencia de cartera" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          Recomendación simulada: <strong>{labels[recommended.kind]}</strong>
          {amount ? ` · ${amount}` : ""}
          {recommended.rate !== null ? ` · tipo anual ${formatPercent(recommended.rate)}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums" aria-label="Comparación de escenarios de tesorería">
            <thead>
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3">Escenario</th>
                <th scope="col" className="px-3 py-2 text-right">Sin actuar</th>
                <th scope="col" className="py-2 pl-3 text-right">Recomendación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, before, after]) => (
                <tr key={label} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 font-normal text-muted-foreground">{label}</th>
                  <td className="px-3 py-2 text-right">{before}</td>
                  <td className="py-2 pl-3 text-right">{after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Saldo a 6m sin actuar (p10 / p50 / p90): {formatCurrency(cash.p10, currency)}
          {" · "}{formatCurrency(cash.p50, currency)}{" · "}{formatCurrency(cash.p90, currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          Frecuencias simuladas no calibradas; no son probabilidades de impago ni efectos causales.
          Esta comparación no recalcula el índice de salud ni ejecuta ofertas.
          {" "}Preferencias del escenario (λ / μ): {formatCurrency(treasury.risk_weight, currency)}
          {" / "}{formatCurrency(treasury.dscr_weight, currency)}; no son parámetros estimados.
        </p>
      </CardContent>
    </Card>
  );
}

export function ScoreHeader({
  snapshot,
  title,
}: {
  snapshot: ScoreSnapshot;
  /** Compact identity for compare columns; omitted on the ficha (breadcrumb owns it). */
  title?: ReactNode;
}) {
  const watch = watchMeta(snapshot.watch ?? null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {title ? (
          <div className="font-heading text-base font-semibold tracking-tight">
            {title}
          </div>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">
          {snapshot.company_id} · {formatMonth(snapshot.month)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ScoreBandBadge band={snapshot.band} />
        <OutlookBadge outlook={snapshot.outlook} />
        {watch.active ? <Badge variant="destructive">En seguimiento</Badge> : null}
      </div>
    </div>
  );
}

function GaugeModePills({
  mode,
  onChange,
}: {
  mode: GaugeMode;
  onChange: (m: GaugeMode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["score", "Índice de salud"],
          ["dimensions", "Dimensiones"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            mode === id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DimensionsGauges({ dimensions }: { dimensions: Dimensions }) {
  return (
    <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
      {DIMENSION_KEYS.map((key) => {
        const pts = dimensions[key] * 100;
        return (
          <ScoreGauge
            key={key}
            score={pts}
            label={DIMENSION_LABELS[key]}
            size="sm"
            reasoning={dimensionReasoning(key, dimensions[key])}
          />
        );
      })}
    </div>
  );
}

export function ScoreHero({
  snapshot,
  extras,
  color,
  layout = "split",
  showDrivers = false,
}: {
  snapshot: ScoreSnapshot;
  extras?: ReactNode;
  color?: string;
  layout?: "split" | "stack";
  showDrivers?: boolean;
}) {
  const [mode, setMode] = useState<GaugeMode>("score");
  const watch = watchMeta(snapshot.watch ?? null);
  return (
    <div className="space-y-4">
      <GaugeModePills mode={mode} onChange={setMode} />
      <div
        className={cn(
          "grid gap-6",
          layout === "split" && "lg:grid-cols-[minmax(240px,1fr)_1fr]"
        )}
      >
        {mode === "score" ? (
          <ScoreGauge
            score={snapshot.score}
            band={snapshot.band}
            reasoning={snapshot.explanation}
            color={color}
          />
        ) : (
          <DimensionsGauges dimensions={snapshot.dimensions} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <SubScoresCard subScores={snapshot.sub_scores} />
          {showDrivers ? (
            <DriversPanel drivers={snapshot.drivers} compact />
          ) : null}
          {snapshot.treasury ? <TreasuryCard treasury={snapshot.treasury} /> : null}
          {watch.active ? (
            <Alert className="sm:col-span-2">
              <AlertTitle>Watch activo</AlertTitle>
              <AlertDescription>{watch.description}</AlertDescription>
            </Alert>
          ) : null}
          {snapshot.alerts.map((a) => (
            <Alert key={a.id} className="sm:col-span-2" variant="destructive">
              <AlertTitle>{a.severity}</AlertTitle>
              <AlertDescription>{a.message}</AlertDescription>
            </Alert>
          ))}
          {extras}
        </div>
      </div>
    </div>
  );
}

export function DimensionsPanel({
  dimensions,
  compare,
  series,
}: {
  dimensions?: ScoreSnapshot["dimensions"];
  compare?: ScoreSnapshot["dimensions"];
  series?: RadarSeries[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dimensiones</CardTitle>
        <CardDescription>
          Liquidez · Cobros · Pagos · Deuda · Actividad
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DimensionRadar
          dimensions={dimensions}
          compare={compare}
          series={series}
        />
      </CardContent>
    </Card>
  );
}

export function TrajectoryPanel({
  history,
  projection,
  series,
  reasoning,
}: {
  history?: ScoreSnapshot["history"];
  projection?: Projection6m;
  series?: TrajectorySeries[];
  reasoning?: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Trayectoria</CardTitle>
            <CardDescription>
              {series && series.length > 0
                ? "Histórico del índice de salud"
                : "Histórico + abanico a 6 meses"}
            </CardDescription>
          </div>
          {reasoning ? <ReasoningHint text={reasoning} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <ScoreTrajectory
          history={history}
          projection={projection}
          series={series}
        />
      </CardContent>
    </Card>
  );
}

export function DriversPanel({
  drivers,
  compact = false,
}: {
  drivers: Driver[];
  compact?: boolean;
}) {
  return (
    <Card size={compact ? "sm" : "default"}>
      <CardHeader>
        <CardTitle>Actualizaciones</CardTitle>
        {!compact ? (
          <CardDescription>Señales que mueven el score</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <DriverList drivers={drivers} />
      </CardContent>
    </Card>
  );
}

function peersExtras(
  peers: PeerCohort | null | undefined,
  currency: string | undefined,
  extras: ReactNode | undefined
): ReactNode {
  if (extras !== undefined) return extras;
  if (peers && peers.k > 0) {
    return <PeerCohortCard cohort={peers} currency={currency ?? "EUR"} />;
  }
  return null;
}

/** Compact column for compare: identity + gauge pills + sub-scores (+ drivers). */
export function ScoreColumn({
  snapshot,
  title,
  extras,
  peers,
  currency,
  color,
  layout = "split",
  className,
}: {
  snapshot: ScoreSnapshot;
  title?: ReactNode;
  extras?: ReactNode;
  peers?: PeerCohort | null;
  currency?: string;
  color?: string;
  layout?: "split" | "stack";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-6", className)}>
      <ScoreHeader snapshot={snapshot} title={title} />
      <ScoreHero
        snapshot={snapshot}
        extras={peersExtras(peers, currency, extras)}
        color={color}
        layout={layout}
        showDrivers
      />
    </div>
  );
}

export function ScoreOverview({
  snapshot,
  extras,
  peers,
  currency,
  actions,
}: {
  snapshot: ScoreSnapshot;
  extras?: ReactNode;
  peers?: PeerCohort | null;
  currency?: string;
  /** Acciones column left of Trayectoria. */
  actions?: ReactNode;
}) {
  return (
    <>
      <ScoreColumn
        snapshot={snapshot}
        extras={extras}
        peers={peers}
        currency={currency}
      />
      <div
        className={cn(
          "grid gap-6",
          actions ? "lg:grid-cols-[minmax(16rem,22rem)_1fr]" : "lg:grid-cols-1"
        )}
      >
        {actions}
        <TrajectoryPanel
          history={snapshot.history}
          projection={snapshot.projection_6m}
          reasoning={trajectoryReasoning(snapshot, snapshot.projection_6m)}
        />
      </div>
    </>
  );
}
