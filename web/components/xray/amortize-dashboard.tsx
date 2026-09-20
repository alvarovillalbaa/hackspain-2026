"use client";

import { useMemo, useState } from "react";
import { AmountSolver } from "@/components/xray/amount-solver";
import { DimensionRadar } from "@/components/xray/dimension-radar";
import { ScoreBandBadge } from "@/components/xray/score-band-badge";
import { ScoreGauge } from "@/components/xray/score-gauge";
import { ScoreTrajectory } from "@/components/xray/score-trajectory";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import { ErrorState } from "@/components/xray/feedback-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAmortizeContext } from "@/hooks/xray/use-amortize-context";
import {
  allocateAmortization,
  amortizeAmountBounds,
  type AmortizePlan,
  withCashWarning,
} from "@/lib/xray/amortize";
import { actionKindLabel, formatCurrency, formatRate } from "@/lib/xray/format";
import { applyAction, upliftPoints } from "@/lib/xray/scoring";
import type { ActionRecommendation, ScoreSnapshot } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

type AmortizeDashboardProps = {
  companyId: string;
  action: ActionRecommendation;
  score: ScoreSnapshot;
};

export function AmortizeDashboard({
  companyId,
  action,
  score,
}: AmortizeDashboardProps) {
  const { data: ctx, loading: ctxLoading, error: ctxError } =
    useAmortizeContext(companyId);
  const [amount, setAmount] = useState<number | undefined>(undefined);

  const bounds = useMemo(
    () => amortizeAmountBounds(ctx, action.recommended_amount),
    [ctx, action.recommended_amount]
  );

  const sliderMax = bounds.max || action.recommended_amount;
  const effectiveAmount = Math.min(
    Math.max(amount ?? action.recommended_amount, bounds.min),
    sliderMax
  );

  const after = useMemo(
    () => applyAction(score, action, effectiveAmount),
    [score, action, effectiveAmount]
  );
  const uplift = upliftPoints(score, after);

  const plan = useMemo(() => {
    const base = allocateAmortization(ctx?.contracts ?? [], effectiveAmount);
    return withCashWarning(base, effectiveAmount, ctx?.cash_balance);
  }, [ctx, effectiveAmount]);

  if (ctxError) {
    return (
      <ErrorState
        title="No se ha podido cargar el contexto de amortización"
        description={ctxError.message}
        placement="card"
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{actionKindLabel(action.kind)}</span>
        <ReasoningHint text={action.reasoning ?? action.rationale} />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Importe a amortizar</CardTitle>
          <CardDescription>
            Recomendado {formatCurrency(action.recommended_amount)}
            {ctx?.cash_balance != null
              ? ` · Caja disponible ${formatCurrency(ctx.cash_balance)}`
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AmountSolver
            value={effectiveAmount}
            min={bounds.min}
            max={sliderMax}
            uplift={uplift}
            from={score.score}
            to={after.score}
            toBand={after.band}
            reasoning={action.reasoning ?? action.rationale}
            onChange={setAmount}
          />
          {plan.exceeds_cash ? (
            <Alert variant="destructive">
              <AlertTitle>Importe por encima de la caja</AlertTitle>
              <AlertDescription>
                Necesitarías {formatCurrency(effectiveAmount)} frente a{" "}
                {formatCurrency(ctx?.cash_balance ?? 0)} disponibles.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ScoreSnapshotCard title="Antes" description="Score actual" snapshot={score} />
        <ScoreSnapshotCard
          title="Después"
          description={`Tras amortizar ${formatCurrency(effectiveAmount)}`}
          snapshot={after}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dimensiones</CardTitle>
            <CardDescription>Antes vs después</CardDescription>
          </CardHeader>
          <CardContent>
            <DimensionRadar
              dimensions={score.dimensions}
              compare={after.dimensions}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Proyección 6m</CardTitle>
            <CardDescription>
              Abanico tras la amortización · p10{" "}
              {after.projection_6m.p10.toFixed(1)} / p50{" "}
              {after.projection_6m.p50.toFixed(1)} / p90{" "}
              {after.projection_6m.p90.toFixed(1)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrajectory
              history={score.history}
              projection={after.projection_6m}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuadro de deuda</CardTitle>
          <CardDescription>
            Waterfall: primero los tipos más altos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DebtWaterfall loading={ctxLoading} plan={plan} />
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreSnapshotCard({
  title,
  description,
  snapshot,
}: {
  title: string;
  description: string;
  snapshot: ScoreSnapshot;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <ScoreGauge score={snapshot.score} band={snapshot.band} />
        <ScoreBandBadge band={snapshot.band} />
        <div className="grid w-full grid-cols-2 gap-2 font-mono text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Liquidez</span>
            <span>{snapshot.sub_scores.liquidity}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cobros</span>
            <span>{snapshot.sub_scores.collections}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deuda</span>
            <span>{snapshot.sub_scores.debt}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DebtWaterfall({
  loading,
  plan,
}: {
  loading: boolean;
  plan: AmortizePlan;
}) {
  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }
  if (plan.rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cuadro de amortización; el impacto es el del modelo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Banco</th>
              <th className="pb-2 pr-3 font-medium">Tipo</th>
              <th className="pb-2 pr-3 text-right font-medium">Pendiente</th>
              <th className="pb-2 pr-3 text-right font-medium">Tipo %</th>
              <th className="pb-2 pr-3 text-right font-medium">Amortizado</th>
              <th className="pb-2 text-right font-medium">Ahorro anual</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((row) => (
              <tr
                key={row.product_id}
                className={cn(
                  "border-b border-border/60",
                  row.allocated > 0 && "bg-muted/40"
                )}
              >
                <td className="py-2 pr-3">{row.bank_name}</td>
                <td className="py-2 pr-3 text-muted-foreground">{row.type}</td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatCurrency(row.outstanding)}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {row.annual_rate != null ? formatRate(row.annual_rate) : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums">
                  {formatCurrency(row.allocated)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {formatCurrency(row.interest_saved_annual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Principal amortizado</div>
          <div className="font-mono tabular-nums">
            {formatCurrency(plan.total_allocated)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">
            Intereses anuales evitados
          </div>
          <div className="font-mono tabular-nums">
            {formatCurrency(plan.total_interest_saved_annual)}
          </div>
        </div>
      </div>
    </div>
  );
}
