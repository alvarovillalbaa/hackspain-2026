"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AmortizeDashboard } from "@/components/xray/amortize-dashboard";
import { AppShell } from "@/components/xray/app-shell";
import { ProductMatchCard } from "@/components/xray/product-match-card";
import { AmountSolver } from "@/components/xray/amount-solver";
import { MarketplacePipeline } from "@/components/xray/marketplace-pipeline";
import { ReasoningHint } from "@/components/xray/reasoning-hint";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductMatches } from "@/hooks/xray/use-product-matches";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { publishedProjection } from "@/lib/xray/scoring";
import { actionKindLabel, formatCurrency } from "@/lib/xray/format";

function MarketplaceInner({
  companyId,
  actionId,
}: {
  companyId: string;
  actionId: string;
}) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score, loading: scoreLoading } = useCompanyScore(companyId);

  const isAmortize = action?.kind === "amortize";

  const crumbs = [
    {
      label: company?.name ?? companyId,
      href: `/c/${companyId}`,
    },
    { label: action?.title ?? actionId },
  ];

  if (actionsLoading || scoreLoading || !action || !score) {
    return (
      <AppShell crumbs={crumbs}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (isAmortize) {
    return (
      <AppShell crumbs={crumbs}>
        <AmortizeDashboard
          companyId={companyId}
          action={action}
          score={score}
        />
      </AppShell>
    );
  }

  return (
    <MarketplaceBody
      companyId={companyId}
      actionId={actionId}
      crumbs={crumbs}
    />
  );
}

function MarketplaceBody({
  companyId,
  actionId,
  crumbs,
}: {
  companyId: string;
  actionId: string;
  crumbs: { label: string; href?: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const { data: actions } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score } = useCompanyScore(companyId);

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const {
    data: matches,
    loading,
    phase,
    detail,
    headline,
    source,
    fallbackReason,
    quantity,
  } = useProductMatches(companyId, actionId, amount);

  const effectiveAmount =
    amount ?? matches[0]?.amount ?? action?.recommended_amount;

  // Compat: old ?p=PRODUCT_ID overlay → dedicated product page
  useEffect(() => {
    const p = searchParams.get("p");
    if (p) {
      router.replace(`/c/${companyId}/a/${actionId}/p/${p}`);
    }
  }, [searchParams, companyId, actionId, router]);

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

  return (
    <AppShell crumbs={crumbs}>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {action ? <span>{actionKindLabel(action.kind)}</span> : null}
        {source === "engine" || fallbackReason ? (
          <span>· motor determinista</span>
        ) : null}
        {headline ? <ReasoningHint text={headline} /> : null}
      </div>

      <MarketplacePipeline
        phase={loading || phase === "fallback" ? phase : "done"}
        detail={fallbackReason ?? detail}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
        <div>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-40 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.map((m) => (
                <ProductMatchCard
                  key={m.product.product_id}
                  match={m}
                  currentScore={score?.score ?? 0}
                  href={`/c/${companyId}/a/${actionId}/p/${m.product.product_id}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          {!loading && matches.length > 0 && action && liveUplift ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Importe</CardTitle>
                <CardDescription>
                  Recomendado{" "}
                  {formatCurrency(
                    action.recommended_amount,
                    company?.currency ?? "EUR"
                  )}
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
                  currency={company?.currency ?? "EUR"}
                  reasoning={amountReasoning}
                  onChange={setAmount}
                />
              </CardContent>
            </Card>
          ) : loading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

export default function MarketplacePage({
  params,
}: {
  params: Promise<{ companyId: string; actionId: string }>;
}) {
  const { companyId, actionId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <MarketplaceInner companyId={companyId} actionId={actionId} />
    </Suspense>
  );
}
