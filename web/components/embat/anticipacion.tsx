"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { embatDisplayClass } from "@/components/embat/font";
import { useMethodMetrics } from "@/hooks/xray/use-method-metrics";
import { formatMonth } from "@/lib/xray/format";
import type { MethodMetrics } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const pct = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(v * 100)} %`;
const num = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(v);

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[6px] border border-[#dce0e6] bg-white px-4 py-3">
      <span className="text-[12px] font-medium tracking-[-0.12px] text-[#999]">{label}</span>
      <span className="text-[22px] font-medium tracking-[-0.4px] text-black">{value}</span>
      <span className="text-[12px] tracking-[-0.12px] text-[#666]">{detail}</span>
    </div>
  );
}

export function AnticipacionPanel({
  metrics,
  loading,
  className,
}: {
  metrics: MethodMetrics | null;
  loading: boolean;
  className?: string;
}) {
  const window = metrics?.test_months.length
    ? `${formatMonth(metrics.test_months[0]!)} – ${formatMonth(metrics.test_months[metrics.test_months.length - 1]!)}`
    : null;
  const lt = metrics?.lead_time;
  const p6 = metrics?.persistence.p_red_given_red["6"];
  return (
    <section
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]",
        className
      )}
      aria-labelledby="anticipacion-title"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#dce0e6] px-5 py-[15px]">
        <h2 id="anticipacion-title" className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}>
          Cómo anticipa el score
        </h2>
        {window ? (
          <p className="rounded-[4px] border border-[rgba(17,168,255,0.2)] bg-[rgba(17,168,255,0.05)] px-[3px] py-0.5 text-[12px] font-medium text-[#11a8ff]">
            Prueba: {window}
          </p>
        ) : null}
      </header>
      <div className="px-5 py-[15px]">
        {loading ? (
          <Skeleton className="h-16 w-full rounded bg-[#dce0e6]/50" />
        ) : !metrics || !lt ? (
          <p className="text-[14px] text-[#666]">
            Métricas del método no disponibles en este pack. Regenera con <code>uv run xray-evals</code> y <code>uv run xray-export-web</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Tile
                label="Meses de antelación"
                value={lt.median_crossing == null ? "—" : `${num(lt.median_crossing, 0)} meses`}
                detail={`mediana en los eventos con cruce sostenido (${pct(lt.share_crossing)} de ${lt.n_events})`}
              />
              <Tile
                label="Eventos por tipo de detección"
                value={`${pct(lt.share_crossing)} anticipados`}
                detail={`tardíos ${pct(lt.share_late)} · crónicos ${pct(lt.share_chronic)} · sin historia ${pct(lt.share_no_history)}`}
              />
              <Tile
                label="Persistencia a 6 meses"
                value={pct(p6)}
                detail={`P(rojo en t+6 | rojo hoy) frente a ${pct(metrics.persistence.base_rate)} de base`}
              />
              <Tile
                label="Acierto de orden a 6 meses"
                value={num(metrics.auc6_external, 2)}
                detail={`contra el saldo pasando a negativo · ${num(metrics.auc6_own, 2)} contra el evento propio`}
              />
              <Tile
                label="Abanico a 6 meses"
                value={metrics.projection ? pct(metrics.projection.coverage_80) : "—"}
                detail={metrics.projection
                  ? `cobertura del abanico 80 % · error de la mediana ${num(metrics.projection.mae_p50)} pts`
                  : "sin medir en este pack"}
              />
              <Tile
                label="Watch"
                value={metrics.watch ? pct(metrics.watch.p_red_3m_given_watch) : "—"}
                detail={metrics.watch
                  ? `rojo en ≤ 3 meses con watch, frente a ${pct(metrics.watch.p_red_3m_given_no_watch)} sin · ${pct(metrics.watch.share_rows_with_watch, 1)} de los meses con watch`
                  : "sin medir en este pack"}
              />
            </div>
            <p className="mt-3 text-[12px] tracking-[-0.12px] text-[#999]">
              Cifras de <code>xray-evals</code> sobre {new Intl.NumberFormat("es-ES").format(metrics.n_companies)} empresas y{" "}
              {new Intl.NumberFormat("es-ES").format(metrics.n_rows)} meses-empresa, entrenamiento hasta {formatMonth(metrics.train_until)}.
              El score es un pronóstico de persistencia; no son probabilidades de impago.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export function Anticipacion({ className }: { className?: string }) {
  const { data, loading } = useMethodMetrics();
  return <AnticipacionPanel metrics={data} loading={loading} className={className} />;
}
