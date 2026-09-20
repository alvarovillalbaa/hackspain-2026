"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { embatDisplayClass } from "@/components/embat/font";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
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
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3">
      <span className="text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
        {label}
      </span>
      <span className="text-[22px] font-medium tracking-[-0.22px] text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-[12px] tracking-[-0.12px] text-muted-foreground">
        {detail}
      </span>
    </div>
  );
}

export function AnticipacionPanel({
  metrics,
  loading,
  error,
  className,
}: {
  metrics: MethodMetrics | null;
  loading: boolean;
  error?: Error | null;
  className?: string;
}) {
  const window = metrics?.test_months.length
    ? `${formatMonth(metrics.test_months[0]!)} – ${formatMonth(metrics.test_months[metrics.test_months.length - 1]!)}`
    : null;
  const lt = metrics?.lead_time;
  const p6 = metrics?.persistence.p_red_given_red["6"];
  return (
    <Card
      size="sm"
      className={cn("w-full gap-0 py-0 shadow-sm ring-border/40", className)}
      aria-labelledby="anticipacion-title"
    >
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-[15px]">
        <CardTitle
          id="anticipacion-title"
          className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px]`}
        >
          Cómo anticipa el score
        </CardTitle>
        {window ? (
          <CardAction>
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              Prueba: {window}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="px-5 pb-[15px]">
            <Skeleton className="h-16 w-full rounded-xl bg-muted" />
          </div>
        ) : error ? (
          <ErrorState
            title="No se han podido cargar las métricas"
            description={error.message}
            placement="card"
          />
        ) : !metrics || !lt ? (
          <EmptyState
            title="Métricas no disponibles"
            description="Métricas del método no disponibles en este pack. Regenera con uv run xray-evals y uv run xray-export-web."
            placement="card"
          />
        ) : (
          <>
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
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
                label="Vigilancia"
                value={metrics.watch ? pct(metrics.watch.p_red_3m_given_watch) : "—"}
                detail={metrics.watch
                  ? `rojo en ≤ 3 meses con vigilancia, frente a ${pct(metrics.watch.p_red_3m_given_no_watch)} sin · ${pct(metrics.watch.share_rows_with_watch, 1)} de los meses con vigilancia`
                  : "sin medir en este pack"}
              />
            </div>
            <p className="px-5 py-3 text-[12px] tracking-[-0.12px] text-muted-foreground">
              Cifras de <code>xray-evals</code> sobre {new Intl.NumberFormat("es-ES").format(metrics.n_companies)} empresas y{" "}
              {new Intl.NumberFormat("es-ES").format(metrics.n_rows)} meses-empresa, entrenamiento hasta {formatMonth(metrics.train_until)}.
              El score es un pronóstico de persistencia; no son probabilidades de impago.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function Anticipacion({ className }: { className?: string }) {
  const { data, loading, error } = useMethodMetrics();
  return (
    <AnticipacionPanel
      metrics={data}
      loading={loading}
      error={error}
      className={className}
    />
  );
}
