"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  embatFocusRing,
  outlookColor,
  scoreBadgeClass,
  signedBadgeClass,
  statusClass,
} from "@/components/embat/chrome";
import { embatDisplayClass, embatUiClass } from "@/components/embat/font";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import { EmptyState, AiFailureState } from "@/components/xray/feedback-state";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { DimensionRadar } from "@/components/xray/dimension-radar";
import { ScoreUplift } from "@/components/xray/score-uplift";
import {
  bandMeta,
  confidenceMeta,
  outlookMeta,
  trendMeta,
  watchMeta,
} from "@/lib/xray/bands";
import {
  formatCurrency,
  formatDelta,
  formatMonth,
  formatNumber,
  formatSignedNumber,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import { signalLabel } from "@/lib/xray/signal-labels";
import { SUB_SCORE_KEYS, SUB_SCORE_LABELS } from "@/lib/xray/sub-scores";
import {
  AGE_BAND_LABEL,
  SIZE_BAND_LABEL,
  type PeerCohort,
} from "@/lib/xray/peers";
import type {
  AcceptedDeal,
  ActionRecommendation,
  Alert,
  Driver,
  Outlook,
  ScoreSnapshot,
} from "@/lib/xray/types";
import { cn } from "@/lib/utils";
import type { SignalDotMonth } from "@/components/xray/score-trajectory";

export const TRAJECTORY_RANGES = [3, 6, 12] as const;
export type TrajectoryRange = (typeof TRAJECTORY_RANGES)[number];

export const fichaCardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-sm ring-1 ring-border/40";

export const fichaItemClass =
  "flex items-center justify-between rounded-xl bg-transparent px-2.5 py-2";

export function pickBannerAlert(alerts: Alert[]): Alert | null {
  return (
    alerts.find((a) => a.severity === "critical") ??
    alerts.find((a) => a.severity === "warning") ??
    null
  );
}

export function formatDriverMonth(month: string): string {
  const label = formatMonth(month).trim();
  const match = label.match(/^(\S+)\s+(\d{4})$/);
  if (!match) return label;
  return `${match[1].replace(/\.$/, "")}. ${match[2]}`;
}

export function sliceHistory(
  history: ScoreSnapshot["history"],
  months: TrajectoryRange
): ScoreSnapshot["history"] {
  if (history.length <= months) return history;
  return history.slice(-months);
}

export function plainExplanation(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function FichaFrame({
  banner,
  actionsHref,
  children,
}: {
  banner: Alert | null;
  actionsHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {banner ? (
        <div
          role="alert"
          className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-1.5 overflow-clip bg-[#eb002b] px-4 py-[3px] text-center"
        >
          <p className="text-[12px] font-medium tracking-[-0.12px] text-white">
            Aviso: {banner.message}
          </p>
          {actionsHref ? (
            <Link
              href={actionsHref}
              className={cn(
                "rounded-[2px] text-[12px] font-medium tracking-[-0.12px] text-white underline underline-offset-2",
                embatFocusRing
              )}
            >
              Ver acciones
            </Link>
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-2.5",
          banner && "pt-8"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function FichaTitle({
  name,
  month,
  children,
}: {
  name: string;
  month: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-5 pb-[5px]">
      <h1
        className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}
      >
        {name}
      </h1>
      <p className="rounded-xl border border-primary/20 bg-primary/5 px-[3px] py-0.5 text-[12px] font-medium tracking-[-0.18px] text-primary">
        Última actualización: {formatSlashDateFromMonth(month)}
      </p>
      {children}
    </div>
  );
}

export function FichaChips({
  id,
  outlook,
  children,
}: {
  id: string;
  outlook: Outlook;
  children?: ReactNode;
}) {
  const meta = outlookMeta(outlook);
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-5 pt-[5px] pb-[15px]">
      <span className="inline-flex items-center justify-center rounded-xl border border-warning/20 bg-warning/5 px-[3px] py-0.5 text-[14px] font-medium tracking-[-0.21px] text-warning">
        {id}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
          statusClass(outlook)
        )}
      >
        Estado: {meta.label}
      </span>
      {children}
    </div>
  );
}

export function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b-0 px-5 py-2.5 last:border-b-0">
      <p className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
        {label}
      </p>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
          scoreBadgeClass(value)
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function FichaGauge({
  score,
  band,
  outlook,
}: {
  score: number;
  band: ScoreSnapshot["band"];
  outlook: Outlook;
}) {
  return (
    <div className="flex h-[224px] w-full max-w-[280px] shrink-0 flex-col items-center justify-center gap-1 overflow-clip">
      <ScoreGauge
        score={score}
        band={band}
        color={outlookColor(outlook)}
        variant="embat"
      />
      <p className="max-w-full px-4 text-center text-[13px] font-medium tracking-[-0.13px] text-muted-foreground">
        Banda <span className="text-foreground">{bandMeta(band).label}</span>
        {" · "}
        {outlookMeta(outlook).label}
      </p>
    </div>
  );
}

export function ConfidenceMeter({
  confidence,
  nSignals,
  monthsOfHistory,
}: {
  confidence: ScoreSnapshot["confidence"];
  nSignals?: number;
  monthsOfHistory?: number;
}) {
  const meta = confidenceMeta(confidence);
  const hint = [
    nSignals != null ? `${nSignals} señales` : null,
    monthsOfHistory != null ? `${monthsOfHistory} meses` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-2 py-0.5 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground outline-none transition-colors duration-150 ease-out motion-reduce:transition-none",
                embatFocusRing
              )}
              aria-label={`Confianza ${meta.label}`}
            >
              <span className="flex gap-0.5" aria-hidden>
                {([1, 2, 3] as const).map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "size-1.5 rounded-full",
                      i <= meta.level ? "bg-primary" : "bg-[#dce0e6]"
                    )}
                  />
                ))}
              </span>
              Confianza {meta.label}
            </button>
          }
        />
        <TooltipContent
          side="top"
          className={cn(
            embatUiClass,
            "z-50 max-w-[240px] text-left text-[13px] font-medium tracking-[-0.13px]"
          )}
        >
          <p>{meta.description}</p>
          {hint ? (
            <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function HealthScoreCard({
  snapshot,
  onOpenSignals,
  actionsHref,
}: {
  snapshot: ScoreSnapshot;
  onOpenSignals: () => void;
  actionsHref?: string;
}) {
  const band = bandMeta(snapshot.band);
  const outlook = outlookMeta(snapshot.outlook);
  const trend = trendMeta(snapshot.trend);
  const watch = watchMeta(snapshot.watch);

  return (
    <section
      className={cn(fichaCardClass, "min-h-[300px] min-w-[280px] flex-1")}
      aria-labelledby="health-score"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-[15px]">
        <h2
          id="health-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Score de salud
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-1 py-0.5 text-[12px] font-medium text-muted-foreground">
            {trend.label}
          </span>
          <ConfidenceMeter
            confidence={snapshot.confidence}
            nSignals={snapshot.n_signals}
          />
        </div>
      </header>
      <div className="flex flex-col items-center gap-2 px-5 pt-3">
        <div className="flex w-full flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[-0.11px] text-table-header">
            Banda
          </p>
          <p className="text-[28px] font-medium tracking-[-0.28px] text-foreground">
            {band.label}
            <span className="text-muted-foreground">
              {" · "}
              {outlook.label}
            </span>
          </p>
          <p className="text-[12px] font-medium tracking-[-0.12px] text-table-header">
            Datos a {formatMonth(snapshot.month)}
          </p>
        </div>
        <FichaGauge
          score={snapshot.score}
          band={snapshot.band}
          outlook={snapshot.outlook}
        />
        {snapshot.explanation ? (
          <p className="text-center text-[13px] font-medium tracking-[-0.13px] text-muted-foreground">
            {plainExplanation(snapshot.explanation)}
          </p>
        ) : null}
        {watch.active ? (
          <div className="w-full rounded-xl bg-muted/40 px-3 py-2 text-left">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium tracking-[-0.13px] text-foreground">
                {watch.label}
              </span>
              {actionsHref ? (
                <Link
                  href={actionsHref}
                  className={cn(
                    "rounded-[2px] text-[12px] font-medium tracking-[-0.12px] text-primary transition-colors duration-150 ease-out hover:underline motion-reduce:transition-none",
                    embatFocusRing
                  )}
                >
                  Ver acciones
                </Link>
              ) : (
                <span className="text-[12px] font-medium tracking-[-0.12px] text-table-header">
                  Revisa las acciones de financiación
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
              {watch.description}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 border-t border-border/60">
        {SUB_SCORE_KEYS.map((key) => (
          <SubScoreRow
            key={key}
            label={SUB_SCORE_LABELS[key]}
            value={snapshot.sub_scores[key]}
          />
        ))}
      </div>
      <div className="border-t border-border/60 px-5 py-3">
        <button
          type="button"
          onClick={onOpenSignals}
          className={cn(
            "rounded-[2px] text-[13px] font-medium tracking-[-0.13px] text-primary transition-colors duration-150 ease-out hover:underline motion-reduce:transition-none",
            embatFocusRing
          )}
        >
          Ver señales
        </button>
      </div>
    </section>
  );
}

export function DriverRow({ driver }: { driver: Driver }) {
  return (
    <div className={fichaItemClass}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-[15px] font-medium tracking-[-0.15px] text-muted-foreground">
          {signalLabel(driver.signal)}
        </p>
        <p className="text-[12px] font-medium tracking-[-0.12px] text-table-header">
          {formatDriverMonth(driver.since)}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
          signedBadgeClass(driver.delta)
        )}
      >
        {formatSignedNumber(driver.delta)}
      </span>
    </div>
  );
}

export function ActualizacionesCard({ drivers }: { drivers: Driver[] }) {
  return (
    <section
      className={cn(fichaCardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="actualizaciones-score"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-[15px]">
        <h2
          id="actualizaciones-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Actualizaciones de Score
        </h2>
        {drivers.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">Sin actualizaciones.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {drivers.map((driver) => (
              <DriverRow
                key={`${driver.signal}-${driver.since}`}
                driver={driver}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function ActionRow({
  action,
  snapshot,
  href,
  subtitle,
  currency = "EUR",
}: {
  action: ActionRecommendation;
  snapshot: ScoreSnapshot;
  href: string;
  subtitle?: string;
  currency?: string;
}) {
  const projection = publishedProjection(snapshot, action);
  const description = action.description ?? action.title;
  const tip = action.reasoning ?? action.rationale;
  const confidence = action.confidence ?? snapshot.confidence;

  return (
    <div
      className={cn(
        fichaItemClass,
        "transition-colors duration-150 ease-out hover:bg-[rgba(220,224,230,0.45)] motion-reduce:transition-none"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 pr-1">
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className={cn(
              "block min-w-0 truncate text-[15px] font-medium tracking-[-0.15px] text-muted-foreground hover:underline",
              embatFocusRing
            )}
          >
            {description}
          </Link>
          {subtitle ? (
            <p className="truncate text-[12px] font-medium tracking-[-0.12px] text-table-header">
              {subtitle}
            </p>
          ) : null}
        </div>
        <RationaleTip text={tip} />
      </div>
      <span className="w-[72px] shrink-0 text-center text-[12px] font-medium tracking-[-0.12px] text-table-header">
        {confidenceMeta(confidence).label}
      </span>
      <Link
        href={href}
        tabIndex={-1}
        className="w-[110px] shrink-0 truncate text-right text-[14px] font-medium tracking-[-0.14px] tabular-nums text-table-header"
      >
        {action.recommended_amount > 0
          ? formatCurrency(action.recommended_amount, currency)
          : "—"}
      </Link>
      <Link
        href={href}
        tabIndex={-1}
        className="flex w-[80px] shrink-0 items-center justify-end"
      >
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
            signedBadgeClass(projection.uplift)
          )}
        >
          {formatSignedNumber(projection.uplift)}
        </span>
      </Link>
    </div>
  );
}

export function RationaleTip({ text }: { text: string }) {
  return <ReasoningHint text={text} />;
}

export function AccionesCard<T extends ActionRecommendation>({
  actions,
  loading,
  snapshot,
  hrefFor,
  subtitleFor,
  empty,
  error,
  currency = "EUR",
}: {
  actions: T[];
  loading: boolean;
  snapshot: ScoreSnapshot;
  hrefFor: (action: T) => string;
  subtitleFor?: (action: T) => string | undefined;
  empty: string;
  error?: Error | null;
  currency?: string;
}) {
  return (
    <section
      id="acciones"
      className={cn(fichaCardClass, "min-h-[220px] w-full scroll-mt-4")}
      aria-labelledby="acciones-recomendadas"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-[15px]">
        <h2
          id="acciones-recomendadas"
          className="px-2.5 text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Acciones recomendadas
        </h2>
        <div className="flex items-center px-2.5 text-[14px] font-medium tracking-[-0.14px] text-table-header">
          <span className="min-w-0 flex-1">Acción</span>
          <span className="w-[72px] text-center">Conf.</span>
          <span className="w-[110px] text-right">Importe</span>
          <span className="w-[80px] text-right">Δ</span>
        </div>
        <p className="px-2.5 text-[11px] font-medium tracking-[-0.11px] text-table-header">
          Uplift: impacto what-if sobre las dimensiones, no recalcula el índice
          de salud oficial.
        </p>
        {loading ? (
          <>
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
          </>
        ) : error ? (
          <AiFailureState
            error={error}
            title="No se han podido cargar las acciones"
            placement="card"
            className="min-h-[120px] p-2"
          />
        ) : actions.length === 0 ? (
          <EmptyState
            title="Sin acciones"
            description={empty}
            placement="card"
            className="min-h-[120px] p-2"
          />
        ) : (
          actions.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              snapshot={snapshot}
              href={hrefFor(action)}
              subtitle={subtitleFor?.(action)}
              currency={currency}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function TrajectoryCard({
  history,
  projection,
  signalDots,
}: {
  history: ScoreSnapshot["history"];
  projection: ScoreSnapshot["projection_6m"];
  signalDots?: SignalDotMonth[];
}) {
  const [range, setRange] = useState<TrajectoryRange>(6);
  const sliced = sliceHistory(history, range);
  const slicedDots = (signalDots ?? []).filter((d) =>
    sliced.some((h) => h.month === d.month)
  );

  return (
    <section
      className={cn(fichaCardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="trayectoria-score"
    >
      <header className="flex items-center justify-between gap-2 px-5 py-[15px]">
        <h2
          id="trayectoria-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground"
        >
          Trayectoria
        </h2>
        <ToggleGroup
          spacing={0}
          variant="outline"
          size="sm"
          value={[String(range)]}
          onValueChange={(next) => {
            const v = Number(next[0]) as TrajectoryRange;
            if (TRAJECTORY_RANGES.includes(v)) setRange(v);
          }}
        >
          {TRAJECTORY_RANGES.map((value) => (
            <ToggleGroupItem key={value} value={String(value)}>
              {value}m
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        <ScoreTrajectory
          history={sliced}
          projection={projection}
          signalDots={slicedDots}
          embat
          className="h-full"
        />
      </div>
    </section>
  );
}

export function FichaSkeleton() {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-[5px]">
        <Skeleton className="h-6 w-48 rounded bg-[#dce0e6]/50" />
        <Skeleton className="h-5 w-40 rounded bg-[#dce0e6]/50" />
      </div>
      <div className="flex items-center gap-2.5 px-5 pt-[5px] pb-[15px]">
        <Skeleton className="h-6 w-24 rounded bg-[#dce0e6]/50" />
        <Skeleton className="h-6 w-32 rounded bg-[#dce0e6]/50" />
      </div>
      <div className="flex flex-col gap-[30px]">
        <div className="flex flex-wrap gap-[30px]">
          <Skeleton className="h-[266px] w-[428px] max-w-full rounded-2xl bg-[#dce0e6]/50" />
          <Skeleton className="h-[266px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
          <Skeleton className="h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
        </div>
        <div className="flex flex-wrap gap-[30px]">
          <Skeleton className="h-[300px] w-[425px] max-w-full rounded-2xl bg-[#dce0e6]/50" />
          <Skeleton className="h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
        </div>
      </div>
    </>
  );
}

export function DimensionsFichaCard({
  dimensions,
}: {
  dimensions: ScoreSnapshot["dimensions"];
}) {
  return (
    <section
      className={cn(fichaCardClass, "min-h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="dimensiones-score"
    >
      <header className="border-b-0 px-5 py-[15px]">
        <h2
          id="dimensiones-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Dimensiones
        </h2>
      </header>
      <div className="p-[15px]">
        <DimensionRadar dimensions={dimensions} />
      </div>
    </section>
  );
}

export function PeersFichaCard({
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
    <section
      className={cn(fichaCardClass, "min-h-0 min-w-[260px] flex-1")}
      aria-labelledby="comparables-score"
    >
      <header className="border-b-0 px-5 py-[15px]">
        <h2
          id="comparables-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Comparables
        </h2>
        <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-table-header">
          {SIZE_BAND_LABEL[cohort.size.band]} · {AGE_BAND_LABEL[cohort.age.band]}{" "}
          · {poolLabel}
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2.5 p-[15px] sm:grid-cols-4">
        <PeerTile label="Flujo mensual">
          {formatCurrency(cohort.size.monthly_flow, currency)}
          <span className="mt-0.5 block text-[11px] font-medium text-table-header">
            p{cohort.size.percentile} en {cohort.currency}
          </span>
        </PeerTile>
        <PeerTile label="Antigüedad">
          {cohort.age.months} meses
          <span className="mt-0.5 block text-[11px] font-medium text-table-header">
            {ageHint}
          </span>
        </PeerTile>
        <PeerTile label="Media vecinos">
          {formatNumber(cohort.peer_score_mean)}
        </PeerTile>
        <PeerTile label="Vs. media">
          {formatDelta(cohort.delta)}
          <span className="mt-0.5 block text-[11px] font-medium text-table-header">
            mejor que {cohort.better_than}/{cohort.k}
          </span>
        </PeerTile>
      </div>
    </section>
  );
}

function PeerTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/40 px-2.5 py-2">
      <div className="text-[11px] font-medium tracking-[-0.11px] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-[14px] font-medium tracking-[-0.14px] tabular-nums text-black">
        {children}
      </div>
    </div>
  );
}

export function DealFichaCard({
  deal,
  currency,
}: {
  deal: AcceptedDeal;
  currency: string;
}) {
  return (
    <section
      className={cn(fichaCardClass, "min-w-[260px] flex-1")}
      aria-labelledby="oferta-aceptada"
    >
      <header className="border-b-0 px-5 py-[15px]">
        <h2
          id="oferta-aceptada"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Oferta aceptada
        </h2>
      </header>
      <div className="flex flex-col gap-2 p-[15px] text-[14px] tracking-[-0.14px] text-muted-foreground">
        <p>
          {deal.label} · {deal.issuer_name} ·{" "}
          {formatCurrency(deal.amount, currency)}
        </p>
        <p className="text-[12px] text-table-header">
          Health Score actualizado tras la contratación (demo live)
        </p>
        <ScoreUplift uplift={deal.uplift} to={deal.projected_score} />
      </div>
    </section>
  );
}
