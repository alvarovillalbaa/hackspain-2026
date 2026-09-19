"use client";

import { Suspense, use, useMemo } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { ProductDetail } from "@/components/xray/product-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductMatches } from "@/hooks/xray/use-product-matches";
import { useNegotiation } from "@/hooks/xray/use-expandable";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useTermContext } from "@/hooks/xray/use-term-context";

function ProductPageInner({
  companyId,
  actionId,
  productId,
}: {
  companyId: string;
  actionId: string;
  productId: string;
}) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score, loading: scoreLoading } = useCompanyScore(companyId);
  const { data: termContext } = useTermContext(companyId);
  const { data: matches, loading: matchesLoading } = useProductMatches(
    companyId,
    actionId
  );

  const match = useMemo(
    () => matches.find((m) => m.product.product_id === productId) ?? null,
    [matches, productId]
  );

  const { data: levers } = useNegotiation(
    match?.product.product_id ?? null,
    companyId,
    actionId,
    match?.amount ?? action?.recommended_amount ?? 0
  );

  const crumbs = [
    {
      label: company?.name ?? companyId,
      href: `/c/${companyId}`,
    },
    {
      label: action?.title ?? actionId,
      href: `/c/${companyId}/a/${actionId}`,
    },
    { label: match?.product.label ?? productId },
  ];

  const loading = actionsLoading || scoreLoading || matchesLoading;

  return (
    <AppShell crumbs={crumbs}>
      {loading || !match ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          {!loading && !match ? (
            <p className="text-sm text-muted-foreground">
              Producto no encontrado en las ofertas de esta acción.
            </p>
          ) : null}
        </div>
      ) : (
        <ProductDetail
          match={match}
          levers={levers}
          score={score}
          termContext={termContext}
          companyId={companyId}
          actionId={actionId}
          embedded
        />
      )}
    </AppShell>
  );
}

export default function ProductPage({
  params,
}: {
  params: Promise<{
    companyId: string;
    actionId: string;
    productId: string;
  }>;
}) {
  const { companyId, actionId, productId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <ProductPageInner
        companyId={companyId}
        actionId={actionId}
        productId={productId}
      />
    </Suspense>
  );
}
