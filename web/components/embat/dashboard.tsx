"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AiFailureState, ErrorState } from "@/components/xray/feedback-state";
import { ChartFilterMenu } from "@/components/xray/chart-filter-menu";
import { WidgetBoard } from "@/components/xray/widget-board";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useWatchQueue } from "@/hooks/xray/use-watch-queue";
import { buildDashboardKpis } from "@/lib/xray/dashboard-kpis";
import type { DashboardWidgetId } from "@/lib/xray/dashboard-layout";
import { formatCompactEuro } from "@/lib/xray/format";
import { outlookMeta } from "@/lib/xray/bands";
import {
  applyChartFilters,
  type ChartFilterState,
} from "@/lib/xray/query-filters";
import type { CompanySummary } from "@/lib/xray/company-summary";

const histConfig = {
  count: { label: "Empresas", color: "var(--chart-1)" },
} satisfies ChartConfig;

const outlookConfig = {
  count: { label: "Empresas", color: "var(--chart-2)" },
} satisfies ChartConfig;

const rankConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
} satisfies ChartConfig;

const watchConfig = {
  count: { label: "Alertas", color: "var(--chart-3)" },
} satisfies ChartConfig;

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-[100px] flex-1 flex-col gap-0.5">
      <p className="text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
        {label}
      </p>
      <p className="text-[22px] font-medium tracking-[-0.22px] text-foreground tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] font-medium tracking-[-0.11px] text-table-header">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const { data: summaries, loading: sumLoading, error: sumError } =
    useCompanySummaries();
  const { data: watch, loading: watchLoading, error: watchError } =
    useWatchQueue();
  const [chartFilters, setChartFilters] = useState<ChartFilterState>({
    byField: {},
  });

  const filteredSummaries = useMemo(() => {
    const rows = summaries.map((s) => ({
      ...s,
      outlook: s.outlook,
    })) as unknown as Record<string, unknown>[];
    return applyChartFilters(rows, chartFilters) as unknown as CompanySummary[];
  }, [summaries, chartFilters]);

  const filteredWatch = useMemo(() => {
    if (!chartFilters.byField.outlook?.length) return watch;
    const ids = new Set(filteredSummaries.map((s) => s.company_id));
    return watch.filter((w) => ids.has(w.company_id));
  }, [watch, filteredSummaries, chartFilters]);

  const kpis = useMemo(
    () => buildDashboardKpis(filteredSummaries, filteredWatch),
    [filteredSummaries, filteredWatch]
  );
  const loading = sumLoading || watchLoading;
  const blocked = Boolean(sumError);

  const outlookData = [
    {
      label: outlookMeta("positive").label,
      count: kpis.outlook.positive,
      fill: "var(--positive)",
    },
    {
      label: outlookMeta("stable").label,
      count: kpis.outlook.stable,
      fill: "var(--warning)",
    },
    {
      label: outlookMeta("negative").label,
      count: kpis.outlook.negative,
      fill: "var(--destructive)",
    },
  ];

  const topData = kpis.top_scores.map((r) => ({
    name: r.name.slice(0, 18),
    score: Math.round(r.score),
  }));
  const bottomData = kpis.bottom_scores.map((r) => ({
    name: r.name.slice(0, 18),
    score: Math.round(r.score),
  }));

  const watchBySeverity = [
    {
      label: "Críticas",
      count: filteredWatch.filter((w) => w.severity === "critical").length,
      fill: "var(--destructive)",
    },
    {
      label: "Avisos",
      count: filteredWatch.filter((w) => w.severity === "warning").length,
      fill: "var(--warning)",
    },
  ];

  const renderWidget = (id: DashboardWidgetId) => {
    if (id === "resumen") {
      if (loading) {
        return (
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-16 w-28 rounded-xl bg-muted" />
            <Skeleton className="h-16 w-28 rounded-xl bg-muted" />
            <Skeleton className="h-16 w-28 rounded-xl bg-muted" />
            <Skeleton className="h-16 w-28 rounded-xl bg-muted" />
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-4">
          <KpiCard label="Empresas" value={String(kpis.n_companies)} />
          <KpiCard
            label="Score medio"
            value={
              kpis.mean_score == null
                ? "—"
                : String(Math.round(kpis.mean_score))
            }
          />
          <KpiCard
            label="Caja agregada"
            value={formatCompactEuro(kpis.cash_close_sum)}
          />
          <KpiCard
            label="En vigilancia"
            value={String(kpis.watch_count)}
            hint={`${kpis.outlook.positive}↑ · ${kpis.outlook.stable}→ · ${kpis.outlook.negative}↓`}
          />
        </div>
      );
    }

    if (id === "hist") {
      if (loading) return <Skeleton className="h-full min-h-[140px] rounded-xl bg-muted" />;
      return (
        <ChartContainer
          config={histConfig}
          className="aspect-auto h-full min-h-[140px] w-full"
          initialDimension={{ width: 360, height: 200 }}
        >
          <BarChart data={kpis.histogram}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="bucket"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={28}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--chart-1)" radius={6} />
          </BarChart>
        </ChartContainer>
      );
    }

    if (id === "outlook") {
      if (loading) return <Skeleton className="h-full min-h-[140px] rounded-xl bg-muted" />;
      return (
        <ChartContainer
          config={outlookConfig}
          className="aspect-auto h-full min-h-[140px] w-full"
          initialDimension={{ width: 360, height: 200 }}
        >
          <BarChart data={outlookData}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              width={28}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" radius={6}>
              {outlookData.map((d) => (
                <Cell key={d.label} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      );
    }

    if (id === "top") {
      if (loading) return <Skeleton className="h-full min-h-[140px] rounded-xl bg-muted" />;
      if (topData.length === 0) {
        return <p className="text-[14px] text-muted-foreground">Sin datos.</p>;
      }
      return (
        <ChartContainer
          config={rankConfig}
          className="aspect-auto h-full min-h-[140px] w-full"
          initialDimension={{ width: 360, height: 220 }}
        >
          <BarChart data={topData} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="score" fill="var(--chart-1)" radius={4} />
          </BarChart>
        </ChartContainer>
      );
    }

    if (id === "bottom") {
      if (loading) return <Skeleton className="h-full min-h-[140px] rounded-xl bg-muted" />;
      if (bottomData.length === 0) {
        return <p className="text-[14px] text-muted-foreground">Sin datos.</p>;
      }
      return (
        <ChartContainer
          config={rankConfig}
          className="aspect-auto h-full min-h-[140px] w-full"
          initialDimension={{ width: 360, height: 220 }}
        >
          <BarChart data={bottomData} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="score" fill="var(--chart-5)" radius={4} />
          </BarChart>
        </ChartContainer>
      );
    }

    // watch
    if (watchError) {
      return (
        <AiFailureState
          error={watchError}
          title="No se ha podido cargar la vigilancia"
          placement="card"
          className="min-h-[120px] p-2"
        />
      );
    }
    if (loading) return <Skeleton className="h-full min-h-[120px] rounded-xl bg-muted" />;
    return (
      <ChartContainer
        config={watchConfig}
        className="aspect-auto h-full min-h-[120px] w-full"
        initialDimension={{ width: 320, height: 160 }}
      >
        <BarChart data={watchBySeverity}>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" radius={6}>
            {watchBySeverity.map((d) => (
              <Cell key={d.label} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    );
  };

  if (blocked) {
    return (
      <ErrorState
        title="No se han podido cargar los KPIs"
        description={sumError?.message}
        placement="page"
      />
    );
  }

  return (
    <WidgetBoard
      renderWidget={renderWidget}
      toolbarExtra={
        <ChartFilterMenu
          fields={[
            {
              id: "outlook",
              label: "Perspectiva",
              options: [
                { value: "positive", label: outlookMeta("positive").label },
                { value: "stable", label: outlookMeta("stable").label },
                { value: "negative", label: outlookMeta("negative").label },
              ],
            },
          ]}
          sortOptions={[
            { value: "score", label: "Score" },
            { value: "cash_close", label: "Caja" },
            { value: "name", label: "Nombre" },
          ]}
          value={chartFilters}
          onChange={setChartFilters}
        />
      }
    />
  );
}
