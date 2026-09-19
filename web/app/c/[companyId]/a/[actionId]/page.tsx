"use client";

import { Suspense, use } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { Ofertas } from "@/components/embat/ofertas";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";

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

  const crumbs = [
    {
      label: company?.name ?? companyId,
      href: `/c/${companyId}`,
    },
    { label: action?.title ?? actionId },
  ];

  return (
    <AppShell crumbs={crumbs}>
      <Ofertas companyId={companyId} actionId={actionId} />
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
        <div className="p-8 text-sm text-[#666]">Cargando…</div>
      }
    >
      <MarketplaceInner companyId={companyId} actionId={actionId} />
    </Suspense>
  );
}
