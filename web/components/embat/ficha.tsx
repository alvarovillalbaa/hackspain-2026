"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  embatFocusRing,
  FilterChip,
  outlookColor,
  signedBadgeClass,
} from "@/components/embat/chrome";
import { embatUiClass } from "@/components/embat/font";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
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
  formatMonth,
  formatSignedNumber,
} from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import { signalLabel } from "@/lib/xray/signal-labels";
import { SUB_SCORE_KEYS, SUB_SCORE_LABELS } from "@/lib/xray/sub-scores";
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
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm";

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

export function plainExplanation(text: string): string {
  return text
    .replace(/\boutlook positive\b/g, "outlook positivo")
    .replace(/\boutlook negative\b/g, "outlook negativo")
    .replace(/\boutlook stable\b/g, "outlook estable")
    .replace(/\btendencia improving\b/g, "tendencia en mejora")
    .replace(/\btendencia worsening\b/g, "tendencia a la baja")
    .replace(/\btendencia flat\b/g, "tendencia plana")
    .replace(/\bcash_buffer_days\b/g, "días de colchón de caja")
    .replace(/\boverdue_flow_rate_3m\b/g, "tasa de impago a 3 meses")
    .replace(/\bdscr_6m\b/g, "DSCR a 6 meses")
    .replace(/\bnet_cash_flow_ratio_3m\b/g, "flujo de caja neto a 3 meses");
}

export function sliceHistory(
  history: ScoreSnapshot["history"],
  months: TrajectoryRange
): ScoreSnapshot["history"] {
  if (history.length <= months) return history;
  return history.slice(-months);
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
      <p className="max-w-full px-4 text-center text-[13px] font-medium tracking-[-0.13px] text-[#666]">
        Banda <span className="text-black">{bandMeta(band).label}</span>
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
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-[#dce0e6] bg-white px-2 py-0.5 text-[12px] font-medium tracking-[-0.12px] text-[#666] outline-none transition-colors duration-150 ease-out motion-reduce:transition-none",
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
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className={cn(
          embatUiClass,
          "z-50 w-[240px] rounded-xl border border-[#dce0e6] bg-white p-2.5 text-[13px] font-medium tracking-[-0.13px] text-black shadow-sm ring-0"
        )}
      >
        <p>{meta.description}</p>
        {hint ? (
          <p className="mt-1 text-[12px] text-[#6b6b6b]">{hint}</p>
        ) : null}
      </PopoverContent>
    </Popover>
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
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="health-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Score de salud
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-xl border border-[#dce0e6] bg-white px-1 py-0.5 text-[12px] font-medium text-[#666]">
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
          <p className="text-[11px] font-medium uppercase tracking-[-0.11px] text-[#6b6b6b]">
            Banda
          </p>
          <p className="text-[28px] font-medium tracking-[-0.28px] text-black">
            {band.label}
            <span className="text-[#666]">
              {" · "}
              {outlook.label}
            </span>
          </p>
          <p className="text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
            Datos a {formatMonth(snapshot.month)}
          </p>
        </div>
        <FichaGauge
          score={snapshot.score}
          band={snapshot.band}
          outlook={snapshot.outlook}
        />
        {snapshot.explanation ? (
          <p className="text-center text-[13px] font-medium tracking-[-0.13px] text-[#666]">
            {plainExplanation(snapshot.explanation)}
          </p>
        ) : null}
        {watch.active ? (
          <div className="w-full rounded-xl border border-[#dce0e6] bg-muted/40 px-3 py-2 text-left">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="text-[13px] font-medium tracking-[-0.13px] text-black">
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
                <span className="text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
                  Revisa las acciones de financiación
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] font-medium tracking-[-0.12px] text-[#666]">
              {watch.description}
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 border-t border-[#dce0e6] px-5 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[-0.11px] text-[#6b6b6b]">
          Sub-scores · escala 0–100
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {SUB_SCORE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="text-[12px] font-medium tracking-[-0.12px] text-[#666]">
                {SUB_SCORE_LABELS[key]}
              </span>
              <span className="text-[12px] font-medium tabular-nums tracking-[-0.12px] text-[#666]">
                {snapshot.sub_scores[key]}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[#dce0e6] px-5 py-3">
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
        <p className="truncate text-[15px] font-medium tracking-[-0.15px] text-[#666]">
          {signalLabel(driver.signal)}
        </p>
        <p className="text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
          {formatDriverMonth(driver.since)}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px] tabular-nums",
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
          className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Actualizaciones de Score
        </h2>
        {drivers.length === 0 ? (
          <p className="text-[14px] text-[#666]">Sin actualizaciones.</p>
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
              "block min-w-0 truncate text-[15px] font-medium tracking-[-0.15px] text-[#666] hover:underline",
              embatFocusRing
            )}
          >
            {description}
          </Link>
          {subtitle ? (
            <p className="truncate text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <RationaleTip text={tip} />
      </div>
      <span className="w-[72px] shrink-0 text-center text-[12px] font-medium tracking-[-0.12px] text-[#6b6b6b]">
        {confidenceMeta(confidence).label}
      </span>
      <Link
        href={href}
        tabIndex={-1}
        className="w-[110px] shrink-0 truncate text-right text-[14px] font-medium tracking-[-0.14px] tabular-nums text-[#6b6b6b]"
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
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="Por qué se recomienda esta acción"
        className={cn(
          "inline-flex h-6 min-w-6 shrink-0 items-center justify-center gap-1 rounded-xl border border-[#dce0e6] bg-white px-1.5 text-[12px] font-medium tracking-[-0.12px] text-[#666] transition-colors duration-150 ease-out motion-reduce:transition-none",
          embatFocusRing
        )}
      >
        <img
          alt=""
          aria-hidden
          src="/embat/icon-info.svg"
          className="size-3.5 max-w-none"
        />
        Por qué
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className={cn(
          embatUiClass,
          "z-50 w-[260px] rounded-xl border border-[#dce0e6] bg-white p-2.5 text-[13px] font-medium tracking-[-0.13px] text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] ring-0 dark:border-[#dce0e6] dark:bg-white dark:text-black"
        )}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

export function AccionesCard<T extends ActionRecommendation>({
  actions,
  loading,
  snapshot,
  hrefFor,
  subtitleFor,
  empty,
  currency = "EUR",
}: {
  actions: T[];
  loading: boolean;
  snapshot: ScoreSnapshot;
  hrefFor: (action: T) => string;
  subtitleFor?: (action: T) => string | undefined;
  empty: string;
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
          className="px-2.5 text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Acciones recomendadas
        </h2>
        <div className="flex items-center px-2.5 text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]">
          <span className="min-w-0 flex-1">Acción</span>
          <span className="w-[72px] text-center">Confianza</span>
          <span className="w-[110px] text-right">Importe</span>
          <span className="w-[80px] text-right">Uplift (pts)</span>
        </div>
        <p className="px-2.5 text-[11px] font-medium tracking-[-0.11px] text-[#6b6b6b]">
          Uplift: impacto what-if sobre las dimensiones, no recalcula el índice
          de salud oficial.
        </p>
        {loading ? (
          <>
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-xl bg-[#dce0e6]/50" />
          </>
        ) : actions.length === 0 ? (
          <p className="px-2.5 text-[14px] text-[#666]">{empty}</p>
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
      <header className="flex items-start justify-between border-b border-[#dce0e6] px-5 py-[15px]">
        <div className="flex items-center gap-2.5">
          <h2
            id="trayectoria-score"
            className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
          >
            Trayectoria
          </h2>
          <FilterChip
            icon="/embat/icon-calendar.svg"
            label={`${range} meses`}
            active
          >
            {(close) => (
              <div className="flex w-full flex-col gap-[5px]">
                {TRAJECTORY_RANGES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setRange(value);
                      close();
                    }}
                    className={cn(
                      "w-full rounded-xl px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px] transition-colors duration-150 ease-out motion-reduce:transition-none",
                      embatFocusRing,
                      range === value
                        ? "bg-primary font-semibold text-white"
                        : "border border-[#dce0e6] bg-white text-[#666]"
                    )}
                  >
                    {value} meses
                  </button>
                ))}
              </div>
            )}
          </FilterChip>
        </div>
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
    <div className="flex flex-col gap-[30px]">
      <div className="flex flex-wrap gap-[30px]">
        <Skeleton className="min-h-[300px] min-w-[280px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
        <Skeleton className="min-h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
        <Skeleton className="min-h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
      </div>
      <div className="flex flex-wrap gap-[30px]">
        <Skeleton className="min-h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
        <Skeleton className="min-h-[300px] min-w-[260px] flex-1 rounded-2xl bg-[#dce0e6]/50" />
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
      <header className="border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="oferta-aceptada"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Oferta aceptada
        </h2>
      </header>
      <div className="flex flex-col gap-2 p-[15px] text-[14px] tracking-[-0.14px] text-[#666]">
        <p>
          {deal.label} · {deal.issuer_name} ·{" "}
          {formatCurrency(deal.amount, currency)}
        </p>
        <p className="text-[12px] text-[#6b6b6b]">
          Impacto what-if (no recalcula el índice de salud oficial)
        </p>
        <ScoreUplift uplift={deal.uplift} to={deal.projected_score} />
      </div>
    </section>
  );
}
