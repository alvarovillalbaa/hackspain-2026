"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import {
  AGE_BAND_LABEL,
  SIZE_BAND_LABEL,
  type PeerCohort,
} from "@/lib/xray/peers";
import { formatDelta, formatNumber } from "@/lib/xray/format";
import { embatFocusRing } from "@/components/embat/chrome";
import { cn } from "@/lib/utils";

const cardClass =
  "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm";

/** Keep the category axis legible without overflowing the chart. */
function shortName(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
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

  const ariaLabel = `Comparables. Score de la empresa ${formatNumber(
    companyScore
  )} frente a la mediana de ${cohort.k} vecinos (${formatNumber(
    cohort.peer_score_mean
  )}); mejor que el ${peerPercentile} % del mes.`;

  return (
    <section
      className={cn(cardClass, "min-h-[300px] min-w-[260px] flex-1")}
      aria-labelledby="benchmark-score"
    >
      <header className="border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="benchmark-score"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#6b6b6b]"
        >
          Comparables
        </h2>
        <p className="mt-1 text-[12px] font-medium tracking-[-0.12px] text-[#666]">
          {titleBits.join(" · ")}
        </p>
        <p className="mt-0.5 text-[11px] font-medium tracking-[-0.11px] text-[#6b6b6b]">
          {SIZE_BAND_LABEL[cohort.size.band]} · {AGE_BAND_LABEL[cohort.age.band]}{" "}
          · {cohort.k} vecinos
        </p>
      </header>
      <div className="min-h-[180px] flex-1 px-3 pb-3 pt-1">
        <div role="img" aria-label={ariaLabel} className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              layout="vertical"
            >
              <CartesianGrid stroke="#dce0e6" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis
                type="category"
                dataKey="id"
                width={112}
                tick={{ fill: "#666", fontSize: 11 }}
                tickFormatter={(value) =>
                  shortName(
                    data.find((d) => d.id === value)?.name ?? String(value)
                  )
                }
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #dce0e6",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value) => [
                  formatNumber(Number(value)),
                  "Score",
                ]}
                labelFormatter={(label) => {
                  const row = data.find((d) => d.id === label);
                  return row?.name ?? String(label);
                }}
              />
              <ReferenceLine
                x={cohort.peer_score_mean}
                stroke="#6b6b6b"
                strokeDasharray="4 4"
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={10}>
                {data.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={entry.self ? "var(--primary)" : "#dce0e6"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Comparables · score por vecino</caption>
          <thead>
            <tr>
              <th scope="col">Empresa</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.self ? "Esta empresa" : row.name}</th>
                <td>{formatNumber(row.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cohort.neighbors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-[#dce0e6] px-5 py-2">
          {cohort.neighbors.slice(0, 5).map((n) => (
            <Link
              key={n.company_id}
              href={`/c/${n.company_id}`}
              className={cn(
                "rounded-lg border border-[#dce0e6] px-1.5 py-0.5 text-[11px] font-medium text-[#666] transition-colors duration-150 ease-out hover:border-primary hover:text-primary motion-reduce:transition-none",
                embatFocusRing
              )}
            >
              {n.name}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
