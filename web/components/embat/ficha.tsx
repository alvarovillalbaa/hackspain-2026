"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FilterChip,
  outlookColor,
  scoreBadgeClass,
  signedBadgeClass,
  statusClass,
} from "@/components/embat/chrome";
import { embatDisplayClass, embatUiClass } from "@/components/embat/font";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { outlookMeta } from "@/lib/xray/bands";
import {
  formatCompactEuro,
  formatMonth,
  formatSignedNumber,
  formatSlashDateFromMonth,
} from "@/lib/xray/format";
import { publishedProjection } from "@/lib/xray/scoring";
import type {
  ActionRecommendation,
  Alert,
  Driver,
  Outlook,
  ScoreSnapshot,
} from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export const TRAJECTORY_RANGES = [3, 6, 12] as const;
export type TrajectoryRange = (typeof TRAJECTORY_RANGES)[number];

export const fichaCardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]";

export const fichaItemClass =
  "flex items-center justify-between rounded-[4px] border border-[#dce0e6] bg-white px-2.5 py-2 shadow-[0px_1px_1px_rgba(13,19,30,0.1)]";

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

export function FichaFrame({
  banner,
  children,
}: {
  banner: Alert | null;
  children: ReactNode;
}) {
  return (
    <div className="relative -mx-[50px] -my-[50px] max-lg:-mx-6 max-lg:-my-6">
      {banner ? (
        <div
          role="alert"
          className="absolute inset-x-0 top-0 z-10 flex items-center justify-center overflow-clip bg-[#eb002b] px-4 py-[3px] text-center"
        >
          <p className="text-[12px] font-medium tracking-[-0.12px] text-white">
            Warning - {banner.message}
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5 px-[50px] py-[70px] max-lg:p-6">
        {children}
      </div>
    </div>
  );
}

export function FichaTitle({ name, month }: { name: string; month: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 pb-[5px]">
      <h1
        className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}
      >
        {name}
      </h1>
      <p className="rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-[3px] py-0.5 text-[12px] font-medium tracking-[-0.18px] text-[#11a8ff]">
        Última actualización: {formatSlashDateFromMonth(month)}
      </p>
    </div>
  );
}

export function FichaChips({
  id,
  outlook,
  companyCount,
}: {
  id: string;
  outlook: Outlook;
  companyCount?: number;
}) {
  const meta = outlookMeta(outlook);
  return (
    <div className="flex items-center gap-2.5 px-5 pt-[5px] pb-[15px]">
      <span className="inline-flex items-center justify-center rounded-[4px] border border-[rgba(239,128,0,0.2)] bg-[rgba(239,128,0,0.05)] px-[3px] py-0.5 text-[14px] font-medium tracking-[-0.21px] text-[#ef8000]">
        {id}
      </span>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
          statusClass(outlook)
        )}
      >
        Estado: {meta.label}
      </span>
      {companyCount != null ? (
        <span className="inline-flex items-center justify-center rounded-[4px] border border-[#dce0e6] bg-[rgba(220,224,230,0.45)] px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px] text-[#666]">
          {companyCount} {companyCount === 1 ? "empresa" : "empresas"}
        </span>
      ) : null}
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
    <div className="flex h-[266px] w-[428px] max-w-full shrink-0 items-center justify-center overflow-clip rounded-[8px] bg-white">
      <ScoreGauge
        score={score}
        band={band}
        color={outlookColor(outlook)}
        variant="embat"
      />
    </div>
  );
}

export function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-[#dce0e6] px-5 py-[15px]">
      <p className="text-[14px] font-medium tracking-[-0.14px] text-[#666]">
        {label}
      </p>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
          scoreBadgeClass(value)
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DesgloseCard({
  bankability,
  business,
}: {
  bankability: number;
  business: number;
}) {
  return (
    <section
      className={cn(fichaCardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="desglose-score"
    >
      <header className="shrink-0 border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="desglose-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#999]"
        >
          Desglose Score
        </h2>
      </header>
      <SubScoreRow label="Bankability" value={bankability} />
      <SubScoreRow label="Business" value={business} />
    </section>
  );
}

export function DriverRow({ driver }: { driver: Driver }) {
  return (
    <div className={fichaItemClass}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-[15px] font-medium tracking-[-0.15px] text-[#666]">
          {driver.signal}
        </p>
        <p className="text-[12px] font-medium tracking-[-0.12px] text-[#999]">
          {formatDriverMonth(driver.since)}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
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
          className="text-[14px] font-medium tracking-[-0.14px] text-[#999]"
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
}: {
  action: ActionRecommendation;
  snapshot: ScoreSnapshot;
  href: string;
  subtitle?: string;
}) {
  const projection = publishedProjection(snapshot, action);

  return (
    <div className={cn(fichaItemClass, "hover:bg-[rgba(220,224,230,0.45)]")}>
      <div className="flex min-w-0 flex-1 items-center gap-1 pr-1">
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="block min-w-0 truncate text-[15px] font-medium tracking-[-0.15px] text-[#666] hover:underline"
          >
            {action.title}
          </Link>
          {subtitle ? (
            <p className="truncate text-[12px] font-medium tracking-[-0.12px] text-[#999]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <RationaleTip text={action.rationale} />
      </div>
      <Link
        href={href}
        tabIndex={-1}
        className="w-[100px] shrink-0 text-right text-[14px] font-medium tracking-[-0.14px] text-[#999]"
      >
        {formatCompactEuro(action.recommended_amount)}
      </Link>
      <Link
        href={href}
        tabIndex={-1}
        className="flex w-[100px] shrink-0 items-center justify-end"
      >
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
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
        openOnHover
        delay={100}
        closeDelay={100}
        aria-label="Por qué se recomienda"
        className="inline-flex size-[10px] shrink-0 items-center justify-center outline-none"
      >
        <span className="relative size-[10px]">
          <img
            alt=""
            src="/embat/icon-info.svg"
            className="absolute inset-0 max-w-none size-full"
          />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn(
          embatUiClass,
          "z-50 w-[260px] origin-(--transform-origin) gap-0 overflow-visible rounded-[6px] border border-[#dce0e6] bg-white p-2.5 text-[13px] leading-snug font-medium tracking-[-0.13px] text-black shadow-[0px_1px_1px_rgba(13,19,30,0.1)] ring-0 duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:border-[#dce0e6] dark:bg-white dark:text-black"
        )}
      >
        {text}
        <PopoverArrow />
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
}: {
  actions: T[];
  loading: boolean;
  snapshot: ScoreSnapshot;
  hrefFor: (action: T) => string;
  subtitleFor?: (action: T) => string | undefined;
  empty: string;
}) {
  return (
    <section
      className={cn(fichaCardClass, "h-[300px] w-[425px] max-w-full shrink-0")}
      aria-labelledby="acciones-recomendadas"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-[15px]">
        <h2
          id="acciones-recomendadas"
          className="px-2.5 text-[14px] font-medium tracking-[-0.14px] text-[#999]"
        >
          Acciones recomendadas
        </h2>
        <div className="flex items-center px-2.5 text-[14px] font-medium tracking-[-0.14px] text-[#999]">
          <span className="min-w-0 flex-1">Tipo</span>
          <span className="w-[100px] text-right">Importe</span>
          <span className="w-[100px] text-right">Puntuación</span>
        </div>
        {loading ? (
          <>
            <Skeleton className="h-9 rounded-[4px] bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-[4px] bg-[#dce0e6]/50" />
            <Skeleton className="h-9 rounded-[4px] bg-[#dce0e6]/50" />
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
}: {
  history: ScoreSnapshot["history"];
  projection: ScoreSnapshot["projection_6m"];
}) {
  const [range, setRange] = useState<TrajectoryRange>(3);
  const sliced = sliceHistory(history, range);

  return (
    <section
      className={cn(fichaCardClass, "h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="trayectoria-score"
    >
      <header className="flex items-start justify-between border-b border-[#dce0e6] px-5 py-[15px]">
        <div className="flex items-center gap-2.5">
          <h2
            id="trayectoria-score"
            className="text-[14px] font-medium tracking-[-0.14px] text-[#999]"
          >
            Trayectoria
          </h2>
          <FilterChip
            icon="/embat/icon-calendar.svg"
            label={`${range} meses`}
            active={range !== 3}
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
                      "w-full rounded-[4px] px-2.5 py-1 text-[13px] font-medium tracking-[-0.13px]",
                      range === value
                        ? "bg-[#11a8ff] font-semibold text-white"
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
      <div className="min-h-0 flex-1 px-3 pb-3 pt-1">
        <ScoreTrajectory
          history={sliced}
          projection={projection}
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
          <Skeleton className="h-[266px] w-[428px] max-w-full rounded-[8px] bg-[#dce0e6]/50" />
          <Skeleton className="h-[300px] min-w-[260px] flex-1 rounded-[8px] bg-[#dce0e6]/50" />
          <Skeleton className="h-[300px] min-w-[260px] flex-1 rounded-[8px] bg-[#dce0e6]/50" />
        </div>
        <div className="flex flex-wrap gap-[30px]">
          <Skeleton className="h-[300px] w-[425px] max-w-full rounded-[8px] bg-[#dce0e6]/50" />
          <Skeleton className="h-[300px] min-w-[260px] flex-1 rounded-[8px] bg-[#dce0e6]/50" />
        </div>
      </div>
    </>
  );
}
