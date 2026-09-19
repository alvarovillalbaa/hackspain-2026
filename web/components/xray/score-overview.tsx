import type { ReactNode } from "react";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreBandBadge, OutlookBadge } from "@/components/xray/score-band-badge";
import { DimensionRadar } from "@/components/xray/dimension-radar";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { DriverList } from "@/components/xray/driver-list";
import { OriginChip } from "@/components/xray/origin-chip";
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
import { formatMonth } from "@/lib/xray/format";
import type { ScoreSnapshot } from "@/lib/xray/types";

export function ScoreOverview({
  snapshot,
  title,
  subtitle,
  extras,
}: {
  snapshot: ScoreSnapshot;
  title: string;
  subtitle?: string;
  extras?: ReactNode;
}) {
  const watch = watchMeta(snapshot.watch ?? null);

  return (
    <>
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
            {subtitle ??
              `Financial Health Score · confianza ${snapshot.confidence} · peer p${snapshot.peer_percentile}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBandBadge band={snapshot.band} />
          <OutlookBadge outlook={snapshot.outlook} />
          {watch.active ? <Badge variant="destructive">Watch</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <ScoreGauge score={snapshot.score} band={snapshot.band} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Sub-scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-mono tabular-nums">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bankability</span>
                <span>{snapshot.sub_scores.bankability}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Business</span>
                <span>{snapshot.sub_scores.business_profile}</span>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Proyección 6m</CardTitle>
              <CardDescription>p10 / p50 / p90</CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-sm tabular-nums">
              {snapshot.projection_6m.p10.toFixed(1)} ·{" "}
              {snapshot.projection_6m.p50.toFixed(1)} ·{" "}
              {snapshot.projection_6m.p90.toFixed(1)}
            </CardContent>
          </Card>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dimensiones</CardTitle>
            <CardDescription>
              Liquidez · Cobros · Pagos · Deuda · Actividad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DimensionRadar dimensions={snapshot.dimensions} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trayectoria</CardTitle>
            <CardDescription>Histórico + abanico a 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrajectory
              history={snapshot.history}
              projection={snapshot.projection_6m}
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
          <DriverList drivers={snapshot.drivers} />
        </CardContent>
      </Card>
    </>
  );
}
