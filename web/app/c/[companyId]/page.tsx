"use client";

import { Suspense, use } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { Compania } from "@/components/embat/compania";
import { useCompanies } from "@/hooks/xray/use-companies";

function CompanyPageInner({ companyId }: { companyId: string }) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);

  return (
    <AppShell
      crumbs={[
        {
          label: company?.name ?? companyId,
          href: `/c/${companyId}`,
        },
      ]}
    >
      <Compania companyId={companyId} />
    </AppShell>
  );
}

export default function ScorePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[#666]">Cargando…</div>
      }
    >
      <CompanyPageInner companyId={companyId} />
    </Suspense>
  );
}
