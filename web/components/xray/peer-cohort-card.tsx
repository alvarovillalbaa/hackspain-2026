import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AGE_BAND_LABEL,
  SIZE_BAND_LABEL,
  type PeerCohort,
} from "@/lib/xray/peers";
import { formatCurrency, formatDelta, formatNumber } from "@/lib/xray/format";

export function PeerCohortCard({
  cohort,
  currency,
}: {
  cohort: PeerCohort;
  currency: string;
}) {
  const poolLabel =
    cohort.pool === "currency"
      ? `${cohort.k} empresas ${cohort.currency}`
      : `${cohort.k} empresas de tamaño relativo similar`;
  const ageHint =
    cohort.age.source === "created_at" ? "desde el alta" : "en el dataset";

  return (
    <Card size="sm" className="sm:col-span-2">
      <CardHeader>
        <CardTitle>Comparables</CardTitle>
        <CardDescription>
          {SIZE_BAND_LABEL[cohort.size.band]} · {AGE_BAND_LABEL[cohort.age.band]}{" "}
          · {poolLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Flujo mensual">
            {formatCurrency(cohort.size.monthly_flow, currency)}
            <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
              p{cohort.size.percentile} en {cohort.currency}
            </span>
          </Tile>
          <Tile label="Antigüedad">
            {cohort.age.months} meses
            <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
              {ageHint}
            </span>
          </Tile>
          <Tile label="Media vecinos">
            {formatNumber(cohort.peer_score_mean)}
          </Tile>
          <Tile label="Vs. media">
            <span
              className={
                cohort.delta < 0 ? "text-destructive" : "text-foreground"
              }
            >
              {formatDelta(cohort.delta)}
            </span>
            <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
              mejor que {cohort.better_than}/{cohort.k}
            </span>
          </Tile>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm tabular-nums">{children}</div>
    </div>
  );
}
