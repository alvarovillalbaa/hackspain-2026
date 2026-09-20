"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AGE_BAND_LABEL,
  SIZE_BAND_LABEL,
  type PeerCohort,
} from "@/lib/xray/peers";
import { formatDelta, formatNumber } from "@/lib/xray/format";
import { cn } from "@/lib/utils";

const cardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/40";

const chartConfig = {
  score: { label: "Score", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Short company name for the axis; the full id stays in the tooltip/title. */
function truncateName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

export function PeersBenchmarkCard({
  cohort,
  peerPercentile,
  companyScore,
}: {
  cohort: PeerCohort;
  peerPercentile: number;
  companyScore: number;
}) {
  const data = [
    ...cohort.neighbors.map((n) => ({
      id: n.company_id,
      name: n.name,
      score: n.score,
      self: false,
    })),
    {
      id: cohort.company_id,
      name: "Esta empresa",
      score: companyScore,
      self: true,
    },
  ].sort((a, b) => a.score - b.score);

  const titleBits = [
    `Mejor que el ${peerPercentile}% del mes`,
    `mejor que ${cohort.better_than}/${cohort.k} vecinos`,
    `${formatDelta(cohort.delta)} vs media ${formatNumber(cohort.peer_score_mean)}`,
  ];

  return (
    <section
      className={cn(cardClass, "min-h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="benchmark-score"
    >
      <header className="px-5 py-[15px]">
        <h2
          id="benchmark-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground"
        >
          Benchmarking
        </h2>
        <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
          {titleBits.join(" · ")}
        </p>
        <p className="mt-0.5 text-[11px] font-medium tracking-[-0.11px] text-muted-foreground">
          {SIZE_BAND_LABEL[cohort.size.band]} · {AGE_BAND_LABEL[cohort.age.band]}{" "}
          · {cohort.k} vecinos
        </p>
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full w-full"
          initialDimension={{ width: 400, height: 180 }}
        >
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            layout="vertical"
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="id"
              width={96}
              tickFormatter={(value) => {
                const row = data.find((d) => d.id === value);
                return truncateName(row?.name ?? String(value));
              }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatNumber(Number(value))}
                  labelFormatter={(label) => {
                    const row = data.find((d) => d.id === label);
                    return row ? `${row.name} · ${row.id}` : String(label);
                  }}
                />
              }
            />
            <ReferenceLine
              x={cohort.peer_score_mean}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={10}>
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={entry.self ? "var(--chart-1)" : "var(--border)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      {cohort.neighbors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-5 py-2">
          {cohort.neighbors.slice(0, 5).map((n) => (
            <Link
              key={n.company_id}
              href={`/c/${n.company_id}`}
              title={n.company_id}
              className="rounded-lg bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary"
            >
              {truncateName(n.name)}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
