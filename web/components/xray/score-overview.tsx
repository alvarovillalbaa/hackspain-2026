import type { ReactNode } from "react";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreBandBadge, OutlookBadge } from "@/components/xray/score-band-badge";
import { DimensionRadar, type RadarSeries } from "@/components/xray/dimension-radar";
import {
  ScoreTrajectory,
  type TrajectorySeries,
} from "@/components/xray/score-trajectory";
import { DriverList } from "@/components/xray/driver-list";
import { OriginChip } from "@/components/xray/origin-chip";
import { PeerCohortCard } from "@/components/xray/peer-cohort-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { watchMeta } from "@/lib/xray/bands";
import { formatCurrency, formatDelta, formatMonth, formatNumber, formatPercent } from "@/lib/xray/format";
import type { PeerCohort } from "@/lib/xray/peers";
import type {
  Driver,
  Projection6m,
  ScoreSnapshot,
  SubScores,
  TreasuryProjection,
} from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export function scoreSubtitle(
  snapshot: ScoreSnapshot,
  peers?: PeerCohort | null
): string {
  if (peers && peers.k > 0) {
    return `Financial Health Score · confianza ${snapshot.confidence} · ${formatDelta(peers.delta)} vs ${peers.k} similares`;
  }
  return `Financial Health Score · confianza ${snapshot.confidence} · peer p${snapshot.peer_percentile}`;
}

export function SubScoresCard({ subScores }: { subScores: SubScores }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Sub-scores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 font-mono tabular-nums">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Bankability</span>
          <span>{subScores.bankability}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Business</span>
          <span>{subScores.business_profile}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectionCard({ projection }: { projection: Projection6m }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Proyección 6m</CardTitle>
        <CardDescription>p10 / p50 / p90</CardDescription>
      </CardHeader>
      <CardContent className="font-mono text-sm tabular-nums">
        {projection.p10.toFixed(1)} · {projection.p50.toFixed(1)} ·{" "}
        {projection.p90.toFixed(1)}
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
          Esta comparación no recalcula el Health Score ni ejecuta ofertas.
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
  subtitle,
}: {
  snapshot: ScoreSnapshot;
  title: ReactNode;
  subtitle?: string;
}) {
  const watch = watchMeta(snapshot.watch ?? null);
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <OriginChip origin={snapshot.origin} />
          <span className="font-mono text-xs text-muted-foreground">
            {snapshot.company_id} · {formatMonth(snapshot.month)}
          </span>
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ?? scoreSubtitle(snapshot)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ScoreBandBadge band={snapshot.band} />
        <OutlookBadge outlook={snapshot.outlook} />
        {watch.active ? <Badge variant="destructive">Watch</Badge> : null}
      </div>
    </div>
  );
}

export function ScoreHero({
  snapshot,
  extras,
  color,
  layout = "split",
}: {
  snapshot: ScoreSnapshot;
  extras?: ReactNode;
  color?: string;
  layout?: "split" | "stack";
}) {
  const watch = watchMeta(snapshot.watch ?? null);
  return (
    <div
      className={cn(
        "grid gap-6",
        layout === "split" && "lg:grid-cols-[240px_1fr]"
      )}
    >
      <ScoreGauge
        score={snapshot.score}
        band={snapshot.band}
        reasoning={snapshot.explanation}
        color={color}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SubScoresCard subScores={snapshot.sub_scores} />
        <ProjectionCard projection={snapshot.projection_6m} />
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
}: {
  history?: ScoreSnapshot["history"];
  projection?: Projection6m;
  series?: TrajectorySeries[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trayectoria</CardTitle>
        <CardDescription>
          {series && series.length > 0
            ? "Histórico del Health Score"
            : "Histórico + abanico a 6 meses"}
        </CardDescription>
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

export function DriversPanel({ drivers }: { drivers: Driver[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drivers</CardTitle>
        <CardDescription>Señales que mueven el score</CardDescription>
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

/** Header + gauge + sub-scores + proyección + comparables. Same cards as the ficha. */
export function ScoreColumn({
  snapshot,
  title,
  subtitle,
  extras,
  peers,
  currency,
  color,
  layout = "split",
  className,
}: {
  snapshot: ScoreSnapshot;
  title: ReactNode;
  subtitle?: string;
  extras?: ReactNode;
  peers?: PeerCohort | null;
  currency?: string;
  color?: string;
  layout?: "split" | "stack";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-10", className)}>
      <ScoreHeader
        snapshot={snapshot}
        title={title}
        subtitle={subtitle ?? scoreSubtitle(snapshot, peers)}
      />
      <ScoreHero
        snapshot={snapshot}
        extras={peersExtras(peers, currency, extras)}
        color={color}
        layout={layout}
      />
    </div>
  );
}

export function ScoreOverview({
  snapshot,
  title,
  subtitle,
  extras,
  peers,
  currency,
  drivers = true,
}: {
  snapshot: ScoreSnapshot;
  title: ReactNode;
  subtitle?: string;
  extras?: ReactNode;
  peers?: PeerCohort | null;
  currency?: string;
  drivers?: boolean;
}) {
  return (
    <>
      <ScoreColumn
        snapshot={snapshot}
        title={title}
        subtitle={subtitle}
        extras={extras}
        peers={peers}
        currency={currency}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <DimensionsPanel dimensions={snapshot.dimensions} />
        <TrajectoryPanel
          history={snapshot.history}
          projection={snapshot.projection_6m}
        />
      </div>
      {drivers ? <DriversPanel drivers={snapshot.drivers} /> : null}
    </>
  );
}
