"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
} from "recharts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { alignHistories } from "@/lib/xray/compare";
import { formatMonth, formatNumber, formatSignedNumber } from "@/lib/xray/format";
import { signalLabel } from "@/lib/xray/signal-labels";
import type { Driver, HistoryPoint, Projection6m } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

export type TrajectorySeries = {
  name: string;
  history: HistoryPoint[];
  color?: string;
};

export type SignalDotMonth = {
  month: string;
  score: number;
  drivers: Driver[];
};

type TrajectoryRow = {
  month: string;
  score?: number | null;
  p10?: number | null;
  p50?: number | null;
  p90?: number | null;
  signalScore?: number | null;
  drivers?: Driver[];
};

/** Months `month+1 … month+count` as "YYYY-MM". */
function futureMonths(month: string, count: number): string[] {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return [];
  const out: string[] = [];
  let yy = y;
  let mm = m;
  for (let i = 0; i < count; i++) {
    mm += 1;
    if (mm > 12) {
      mm -= 12;
      yy += 1;
    }
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

/** p10 / p50 / p90 legend; the non-embat branch keeps its descriptive prefix. */
function FanLegend({
  projection,
  label,
}: {
  projection: Projection6m;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {label ? <span>{label}</span> : null}
      <span>p10 {projection.p10.toFixed(1)}</span>
      <span>p50 {projection.p50.toFixed(1)}</span>
      <span>p90 {projection.p90.toFixed(1)}</span>
    </div>
  );
}

export function ScoreTrajectory({
  history,
  projection,
  series,
  signalDots,
  embat = false,
  className,
}: {
  history?: HistoryPoint[];
  projection?: Projection6m;
  series?: TrajectorySeries[];
  /** Clickable driver months on the score line. */
  signalDots?: SignalDotMonth[];
  embat?: boolean;
  className?: string;
}) {
  if (series && series.length > 0) {
    return <CompareTrajectory series={series} className={className} />;
  }
  return (
    <SingleTrajectory
      history={history ?? []}
      projection={projection}
      signalDots={signalDots}
      embat={embat}
      className={className}
    />
  );
}

function CompareTrajectory({
  series,
  className,
}: {
  series: TrajectorySeries[];
  className?: string;
}) {
  const keyed = series.map((s, i) => ({
    key: `s${i}`,
    name: s.name,
    history: s.history,
    color: s.color ?? "var(--foreground)",
  }));
  const data = alignHistories(keyed);
  const ariaLabel = `Comparativa de trayectorias del score para ${keyed
    .map((s) => s.name)
    .join(", ")}.`;

  return (
    <div className={cn("h-56 w-full", className)}>
      <div role="img" aria-label={ariaLabel} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              width={32}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelFormatter={(l) => formatMonth(String(l))}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
            />
            {keyed.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Comparativa de trayectorias del score</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {keyed.map((s) => (
              <th key={s.key} scope="col">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={String(row.month)}>
              <th scope="row">{formatMonth(String(row.month))}</th>
              {keyed.map((s) => {
                const value = row[s.key];
                return (
                  <td key={s.key}>
                    {typeof value === "number" ? formatNumber(value) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DotMarker({
  cx,
  cy,
  payload,
  onSelect,
}: {
  cx?: number;
  cy?: number;
  payload?: { month?: string; drivers?: Driver[]; score?: number };
  onSelect?: (month: string, drivers: Driver[]) => void;
}) {
  if (cx == null || cy == null || !payload?.drivers?.length) return null;
  // `driver.delta` is already in score points, positive = good.
  const good = payload.drivers.every((d) => d.delta > 0);
  const bad = payload.drivers.every((d) => d.delta < 0);
  const fill = good ? "#00a14e" : bad ? "#e61847" : "#ef8000";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(payload.month!, payload.drivers!);
      }}
    />
  );
}

function SingleTrajectory({
  history,
  projection,
  signalDots,
  embat = false,
  className,
}: {
  history: HistoryPoint[];
  projection?: Projection6m;
  signalDots?: SignalDotMonth[];
  embat?: boolean;
  className?: string;
}) {
  const [openDot, setOpenDot] = useState<{
    month: string;
    drivers: Driver[];
  } | null>(null);

  const dotsByMonth = new Map(
    (signalDots ?? []).map((d) => [d.month, d] as const)
  );

  const last = history[history.length - 1];
  const data: TrajectoryRow[] = history.map((h) => {
    const dot = dotsByMonth.get(h.month);
    return {
      month: h.month,
      score: h.score,
      signalScore: dot ? h.score : null,
      drivers: dot?.drivers,
    };
  });

  if (last && projection) {
    const proj = {
      p10: projection.p10,
      p50: projection.p50,
      p90: projection.p90,
    };
    // Fan starts at the last actual month…
    data[data.length - 1] = { ...data[data.length - 1]!, ...proj };
    // …and reaches t+6 through six real monthly steps, so the band reads as time.
    const steps = futureMonths(last.month, 6);
    steps.forEach((month, i) => {
      data.push(i === steps.length - 1 ? { month, ...proj } : { month });
    });
  }

  const ariaLabel =
    last && projection
      ? `Trayectoria del score. Score hoy ${formatNumber(last.score)}; banda p10 ${formatNumber(
          projection.p10
        )} / p50 ${formatNumber(projection.p50)} / p90 ${formatNumber(
          projection.p90
        )} a 6 meses.`
      : last
        ? `Trayectoria del score. Score hoy ${formatNumber(last.score)}.`
        : "Trayectoria del score.";

  const grid = embat ? "#dce0e6" : "var(--border)";
  const tick = embat ? "#999999" : "var(--muted-foreground)";
  const line = embat ? "var(--primary)" : "var(--foreground)";
  const fill = embat ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--foreground)";
  const fan = embat ? "rgba(220,224,230,0.7)" : "var(--muted)";
  const cut = embat ? "#ffffff" : "var(--background)";
  const mid = embat ? "#999999" : "var(--muted-foreground)";
  const tickFont = embat
    ? {
        fill: tick,
        fontSize: 11,
        fontFamily: '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : { fill: tick, fontSize: 11 };
  const tooltip = embat
    ? {
        background: "#ffffff",
        border: "1px solid #dce0e6",
        borderRadius: 6,
        fontSize: 12,
        color: "#000000",
        fontFamily: '"Inter Variable", var(--font-inter-variable), sans-serif',
      }
    : {
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 12,
      };

  const svg = (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={tickFont}
          axisLine={false}
          tickLine={false}
          interval={embat ? 0 : "preserveStartEnd"}
        />
        <YAxis
          domain={[0, 100]}
          width={32}
          tick={tickFont}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={tooltip}
          labelFormatter={(l) => formatMonth(String(l))}
        />
        {projection ? (
          <>
            <Area
              type="monotone"
              dataKey="p90"
              stroke="transparent"
              fill={fan}
              fillOpacity={0.5}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="p10"
              stroke="transparent"
              fill={cut}
              fillOpacity={1}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="p50"
              stroke={mid}
              strokeDasharray="4 4"
              fill="transparent"
              connectNulls
            />
          </>
        ) : null}
        <Area
          type="monotone"
          dataKey="score"
          stroke={line}
          fill={fill}
          fillOpacity={embat ? 1 : 0.06}
          strokeWidth={2}
          connectNulls
        />
        {signalDots && signalDots.length > 0 ? (
          <Scatter
            dataKey="signalScore"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={(props: any) => (
              <DotMarker
                cx={props.cx}
                cy={props.cy}
                payload={props.payload}
                onSelect={(month, drivers) => setOpenDot({ month, drivers })}
              />
            )}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );

  const a11yTable = (
    <table className="sr-only">
      <caption>Trayectoria del score</caption>
      <thead>
        <tr>
          <th scope="col">Mes</th>
          <th scope="col">Score</th>
          <th scope="col">p10</th>
          <th scope="col">p50</th>
          <th scope="col">p90</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h) => (
          <tr key={h.month}>
            <th scope="row">{formatMonth(h.month)}</th>
            <td>{formatNumber(h.score)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
          </tr>
        ))}
        {last && projection ? (
          <tr>
            <th scope="row">A 6 meses</th>
            <td>—</td>
            <td>{formatNumber(projection.p10)}</td>
            <td>{formatNumber(projection.p50)}</td>
            <td>{formatNumber(projection.p90)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );

  const popover = openDot ? (
    <Popover open onOpenChange={(o) => !o && setOpenDot(null)}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-default opacity-0"
            aria-label="Cerrar señal"
          />
        }
      />
      <PopoverContent
        align="center"
        side="top"
        className="z-50 w-[280px] rounded-xl border border-[#dce0e6] bg-white p-3 text-[13px] shadow-sm"
      >
        <p className="mb-2 font-medium text-black">
          Señales · {formatMonth(openDot.month)}
        </p>
        <ul className="flex flex-col gap-2">
          {openDot.drivers.map((d) => {
            // `driver.delta` is already in score points, positive = good.
            const tone =
              d.delta > 0
                ? "text-[#00a14e]"
                : d.delta < 0
                  ? "text-[#e61847]"
                  : "text-[#6b6b6b]";
            const word =
              d.delta > 0 ? "Buena" : d.delta < 0 ? "Mala" : "Sin cambio";
            return (
              <li
                key={`${d.signal}-${d.since}`}
                className="flex items-start justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="font-medium text-[#666]">
                    {signalLabel(d.signal)}
                  </span>
                  <span className={cn("mt-0.5 block text-[11px]", tone)}>
                    {word} para el índice
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums font-medium",
                    tone
                  )}
                >
                  {formatSignedNumber(d.delta)}
                </span>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  ) : null;

  if (embat) {
    return (
      <div className={cn("flex h-full min-h-0 w-full flex-col gap-1", className)}>
        <div className="relative min-h-0 flex-1">
          <div role="img" aria-label={ariaLabel} className="h-full w-full">
            {svg}
          </div>
          {projection ? (
            <span className="pointer-events-none absolute left-9 top-0 z-10 text-[11px] font-medium tracking-[-0.11px] text-[#6b6b6b]">
              Abanico 80 % · 6 meses
            </span>
          ) : null}
          {popover}
        </div>
        {projection ? <FanLegend projection={projection} /> : null}
        {a11yTable}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div role="img" aria-label={ariaLabel} className={cn("h-56 w-full", className)}>
        {svg}
      </div>
      {projection ? (
        <FanLegend projection={projection} label="Histórico · Forecast 6m:" />
      ) : null}
      {a11yTable}
    </div>
  );
}
