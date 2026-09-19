"use client";

import { Suspense, use, useMemo, useState } from "react";
import { LayoutGroup } from "motion/react";
import { AppShell } from "@/components/xray/app-shell";
import { ProductMatchCard } from "@/components/xray/product-match-card";
import { ProductDetail } from "@/components/xray/product-detail";
import { AmountSolver } from "@/components/xray/amount-solver";
import { OriginChip } from "@/components/xray/origin-chip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductMatches } from "@/hooks/xray/use-product-matches";
import { useExpandable, useNegotiation } from "@/hooks/xray/use-expandable";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { applyAction, upliftPoints } from "@/lib/xray/scoring";
import { actionKindLabel } from "@/lib/xray/format";

function MarketplaceInner({
  companyId,
  actionId,
}: {
  companyId: string;
  actionId: string;
}) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const { data: actions } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score } = useCompanyScore(companyId);

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const effectiveAmount = amount ?? action?.recommended_amount;

  const { data: matches, loading } = useProductMatches(
    companyId,
    actionId,
    effectiveAmount
  );
  const { expandedId, expand, collapse } = useExpandable("p");

  const expanded = matches.find((m) => m.product.product_id === expandedId) ?? null;
  const { data: levers } = useNegotiation(
    expanded?.product.product_id ?? null,
    companyId,
    actionId,
    expanded?.amount ?? effectiveAmount ?? 0
  );

  const amountBounds = useMemo(() => {
    if (matches.length === 0) {
      return { min: 50_000, max: 1_000_000 };
    }
    return {
      min: Math.min(...matches.map((m) => m.product.amount_min)),
      max: Math.max(...matches.map((m) => m.product.amount_max)),
    };
  }, [matches]);

  const liveUplift = useMemo(() => {
    if (!score || !action || effectiveAmount == null) return null;
    const after = applyAction(score, action, effectiveAmount);
    return {
      uplift: upliftPoints(score, after),
      band: after.band,
    };
  }, [score, action, effectiveAmount]);

  return (
    <AppShell
      crumbs={[
        {
          label: company?.name ?? companyId,
          href: `/c/${companyId}`,
        },
        { label: action?.title ?? actionId },
      ]}
    >
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-2">
          {action ? <OriginChip origin={action.origin} /> : null}
          {action ? (
            <span className="text-xs text-muted-foreground">
              {actionKindLabel(action.kind)}
            </span>
          ) : null}
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {action?.title ?? "Marketplace"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Productos ordenados por match bilateral (media armónica de clientFit ×
          issuerAppetite). El importe ideal maximiza el uplift bajo DSCR ≥ 1,2×;
          los términos de la tarjeta están optimizados para el emisor.
        </p>
      </div>

      {action && liveUplift ? (
        <Card className="mb-8" size="sm">
          <CardHeader>
            <CardTitle>Importe</CardTitle>
            <CardDescription>
              Recomendado {action.recommended_amount.toLocaleString("es-ES")} €
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AmountSolver
              value={effectiveAmount ?? action.recommended_amount}
              min={amountBounds.min}
              max={amountBounds.max}
              uplift={liveUplift.uplift}
              toBand={liveUplift.band}
              onChange={setAmount}
            />
          </CardContent>
        </Card>
      ) : null}

      <LayoutGroup>
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
                onOpen={() => expand(m.product.product_id)}
              />
            ))}
          </div>
        )}

        {expanded ? (
          <ProductDetail
            match={expanded}
            levers={levers}
            onClose={collapse}
          />
        ) : null}
      </LayoutGroup>
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
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Cargando…</div>}>
      <MarketplaceInner companyId={companyId} actionId={actionId} />
    </Suspense>
  );
}
