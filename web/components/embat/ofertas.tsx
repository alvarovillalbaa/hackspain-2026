"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { AmountSolver } from "@/components/xray/amount-solver";
import { MarketplacePipeline } from "@/components/xray/marketplace-pipeline";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
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
  scoreImprovement,
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
  const uplift = scoreImprovement(match.uplift);
  const fee = embatOriginationFee(match.amount);
  const issuer = match.product.issuer.name;

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
        </ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end gap-2">
        {saving === 0 ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <SignedMetricBadge value={saving}>
            {formatSavingPerYear(saving)}
          </SignedMetricBadge>
        )}
        <SignedMetricBadge value={uplift}>{String(uplift)}</SignedMetricBadge>
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

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const {
    data: matches,
    loading: matchesLoading,
    error: matchesError,
    phase,
    detail,
    headline,
    source,
    fallbackReason,
    quantity,
  } = useProductMatches(
    isAmortize ? undefined : companyId,
    isAmortize || !action ? undefined : actionId,
    amount
  );

  const banner = score ? pickBannerAlert(score.alerts) : null;
  const loading =
    actionsLoading || scoreLoading || (!isAmortize && matchesLoading);

  const effectiveAmount =
    amount ?? matches[0]?.amount ?? action?.recommended_amount;

  const amountBounds = useMemo(() => {
    const rec = action?.recommended_amount ?? 50_000;
    if (matches.length === 0) {
      return { min: Math.min(50_000, rec), max: Math.max(1_000_000, rec) };
    }
    return {
      min: Math.min(rec, ...matches.map((m) => m.product.amount_min)),
      max: Math.max(rec, ...matches.map((m) => m.product.amount_max)),
    };
  }, [matches, action]);

  const liveUplift = useMemo(() => {
    if (!score || !action || effectiveAmount == null) return null;
    const p = publishedProjection(score, action, effectiveAmount);
    return {
      uplift: p.uplift,
      band: p.toBand,
      from: p.before,
      to: p.after,
    };
  }, [score, action, effectiveAmount]);

  const amountReasoning = quantity
    ? [quantity.rationale, quantity.ceiling_reason]
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
          detail={fallbackReason ?? detail}
        />
      </FichaFrame>
    );
  }

  return (
    <FichaFrame banner={banner}>
      <div className="mb-3 flex flex-wrap items-center gap-2 px-5 text-[12px] font-medium tracking-[-0.12px] text-muted-foreground">
        {action ? <span>{actionKindLabel(action.kind)}</span> : null}
        {source === "engine" || fallbackReason ? (
          <span>· motor determinista</span>
        ) : null}
        {headline ? <ReasoningHint text={headline} /> : null}
      </div>

      {phase === "fallback" ? (
        <div className="px-5 pb-3">
          <MarketplacePipeline
            phase="fallback"
            detail={fallbackReason ?? detail}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-[30px] px-5">
        <section className="min-w-0 flex-1" aria-label="Ofertas de financiación">
          {!action ? (
            <p className="py-8 text-sm text-destructive">
              No se ha encontrado esta acción.
            </p>
          ) : matchesError ? (
            <p className="py-8 text-sm text-destructive">
              No se han podido cargar las ofertas. {matchesError.message}
            </p>
          ) : matches.length === 0 ? (
            <Empty className="min-h-[200px] border-0">
              <EmptyHeader>
                <EmptyTitle>Sin ofertas</EmptyTitle>
                <EmptyDescription>
                  Sin ofertas para esta acción.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
          {matches.length > 0 && action && liveUplift ? (
            <Card
              size="sm"
              className="rounded-2xl border-border bg-white shadow-sm"
            >
              <CardHeader>
                <CardTitle className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
                  Importe
                </CardTitle>
                <CardDescription className="text-[13px] text-muted-foreground">
                  Recomendado{" "}
                  {formatCurrency(action.recommended_amount, currency)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AmountSolver
                  value={effectiveAmount ?? action.recommended_amount}
                  min={amountBounds.min}
                  max={amountBounds.max}
                  uplift={liveUplift.uplift}
                  from={liveUplift.from}
                  to={liveUplift.to}
                  toBand={liveUplift.band}
                  currency={currency}
                  reasoning={amountReasoning}
                  onChange={setAmount}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </FichaFrame>
  );
}
