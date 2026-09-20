"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FichaFrame, pickBannerAlert } from "@/components/embat/ficha";
import {
  FeeBadge,
  formatSavingPerYear,
  IssuerMark,
  SignedMetricBadge,
} from "@/components/embat/offer-ui";
import { AmortizeDashboard } from "@/components/xray/amortize-dashboard";
import { EmptyState, ErrorState, AiFailureState } from "@/components/xray/feedback-state";
import { MarketplacePipeline } from "@/components/xray/marketplace-pipeline";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import { ScoreDeltaBar } from "@/components/xray/score-delta-bar";
import { ScoreUplift } from "@/components/xray/score-uplift";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useProductMatches } from "@/hooks/xray/use-product-matches";
import {
  actionKindLabel,
  formatCompactEuro,
  formatCurrency,
  formatRatePct,
} from "@/lib/xray/format";
import {
  annualInterestSaving,
  embatOriginationFee,
} from "@/lib/xray/offer-metrics";
import { publishedProjection } from "@/lib/xray/scoring";
import type { ProductMatch } from "@/lib/xray/types";

function OfferItem({
  match,
  currentRate,
  href,
}: {
  match: ProductMatch;
  currentRate: number | null;
  href: string;
}) {
  const offerRate = match.product.issuer_terms.rate_annual;
  const saving = annualInterestSaving(match.amount, currentRate, offerRate);
  const fee = embatOriginationFee(match.amount);
  const issuer = match.product.issuer.name;
  const matchPct = Math.round(match.breakdown.match * 100);
  const dates =
    match.start_date && match.end_date
      ? `${match.start_date} → ${match.end_date}`
      : null;

  return (
    <Item
      size="sm"
      className="rounded-none border-0 px-0 py-3 hover:bg-muted/50"
      render={<Link href={href} />}
      aria-label={`Ver detalle de ${issuer}`}
    >
      <div className="flex shrink-0 items-center pr-3">
        <IssuerMark name={issuer} />
      </div>
      <ItemContent>
        <ItemTitle className="text-[15px]">{issuer}</ItemTitle>
        <ItemDescription>
          {formatCompactEuro(match.amount)} · {formatRatePct(offerRate)}
          {dates ? ` · ${dates}` : ""}
          {" · "}
          match {matchPct}%
        </ItemDescription>
        {match.rationale ? (
          <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">
            {match.rationale}
          </p>
        ) : null}
      </ItemContent>
      <ItemActions className="flex-wrap justify-end gap-2">
        {saving === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <SignedMetricBadge value={saving}>
            {formatSavingPerYear(saving)}
          </SignedMetricBadge>
        )}
        <FeeBadge amount={fee} />
      </ItemActions>
    </Item>
  );
}

export function Ofertas({
  companyId,
  actionId,
}: {
  companyId: string;
  actionId: string;
}) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const currency = company?.currency ?? "EUR";
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score, loading: scoreLoading } = useCompanyScore(companyId);
  const { data: summaries } = useCompanySummaries();
  const currentRate =
    summaries.find((s) => s.company_id === companyId)?.implied_rate ?? null;
  const isAmortize = action?.kind === "amortize";

  const {
    data: matches,
    loading: matchesLoading,
    error: matchesError,
    phase,
    detail,
    headline,
    quantity,
  } = useProductMatches(
    isAmortize ? undefined : companyId,
    isAmortize || !action ? undefined : actionId
  );

  const banner = score ? pickBannerAlert(score.alerts) : null;
  const loading =
    actionsLoading || scoreLoading || (!isAmortize && matchesLoading);

  const liveUplift = useMemo(() => {
    if (!score || !action) return null;
    const p = publishedProjection(
      score,
      action,
      action.recommended_amount
    );
    return {
      uplift: p.uplift,
      band: p.toBand,
      from: p.before,
      to: p.after,
    };
  }, [score, action]);

  const amountReasoning = quantity
    ? [quantity.reasoning, ...(quantity.risks ?? [])]
        .filter(Boolean)
        .join("\n\n")
    : headline;

  if (isAmortize) {
    return (
      <FichaFrame banner={banner}>
        {action && score ? (
          <AmortizeDashboard
            companyId={companyId}
            action={action}
            score={score}
          />
        ) : (
          <Skeleton className="h-48 w-full rounded-2xl bg-muted" />
        )}
      </FichaFrame>
    );
  }

  if (loading) {
    return (
      <FichaFrame banner={banner}>
        <MarketplacePipeline
          phase={phase === "idle" ? "queued" : phase}
          detail={detail}
        />
      </FichaFrame>
    );
  }

  return (
    <FichaFrame banner={banner}>
      <div className="mb-3 flex flex-wrap items-center gap-2 px-5 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
        {action ? <span>{actionKindLabel(action.kind)}</span> : null}
        {headline && !matchesError ? <ReasoningHint text={headline} /> : null}
      </div>

      <div className="flex flex-wrap items-start gap-[30px] px-5">
        <section className="min-w-0 flex-1" aria-label="Ofertas de financiación">
          {!action ? (
            <ErrorState
              title="Acción no encontrada"
              description="No se ha encontrado esta acción."
              placement="card"
            />
          ) : matchesError ? (
            <AiFailureState
              error={matchesError}
              title="No se han podido cargar las ofertas"
              placement="card"
            />
          ) : matches.length === 0 ? (
            <EmptyState
              title="Sin ofertas"
              description="Sin ofertas para esta acción."
              placement="card"
            />
          ) : (
            <ItemGroup className="gap-0">
              {matches.map((match, i) => (
                <div key={match.product.product_id}>
                  {i > 0 ? <ItemSeparator className="my-0" /> : null}
                  <OfferItem
                    match={match}
                    currentRate={currentRate}
                    href={`/c/${companyId}/a/${actionId}/p/${match.product.product_id}`}
                  />
                </div>
              ))}
            </ItemGroup>
          )}
        </section>

        <div className="w-full max-w-[280px] shrink-0">
          {matches.length > 0 && action && score && liveUplift ? (
            <Card
              size="sm"
              className="rounded-2xl border-border bg-white shadow-sm"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
                  Importe
                  <ReasoningHint text={amountReasoning} />
                </CardTitle>
                <CardDescription className="text-[13px] text-muted-foreground">
                  Recomendado{" "}
                  {formatCurrency(action.recommended_amount, currency)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-lg tabular-nums">
                    {formatCurrency(action.recommended_amount, currency)}
                  </span>
                  <ScoreUplift
                    uplift={liveUplift.uplift}
                    from={liveUplift.from}
                    to={liveUplift.to}
                    toBand={liveUplift.band}
                  />
                </div>
                <ScoreDeltaBar
                  current={score.score}
                  uplift={liveUplift.uplift}
                  toBand={liveUplift.band}
                />
                <p className="text-[11px] text-muted-foreground">
                  Misma mejora de Health Score para cualquiera de estos
                  productos.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </FichaFrame>
  );
}
