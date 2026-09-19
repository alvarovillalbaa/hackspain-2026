"use client";

import { Suspense, use, useState } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { Compania } from "@/components/embat/compania";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { useCompanies } from "@/hooks/xray/use-companies";

function CompanyPageInner({ companyId }: { companyId: string }) {
  const { data: companies, addImported } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <AppShell
        crumbs={[
          { label: "Empresas", href: "/companies" },
          {
            label: company?.name ?? companyId,
          },
        ]}
        trailing={
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() => setImportOpen(true)}
          >
            Actualizar datos
          </Button>
        }
      >
        <Compania companyId={companyId} />
      </AppShell>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={addImported}
        targetCompanyId={companyId}
        companies={companies}
      />
    </>
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
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <CompanyPageInner companyId={companyId} />
    </Suspense>
  );
}
