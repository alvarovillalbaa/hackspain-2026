"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadIcon } from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { ScoreOverview } from "@/components/xray/score-overview";
import { ActionCard } from "@/components/xray/action-card";
import { ScoreUplift } from "@/components/xray/score-uplift";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { usePeers } from "@/hooks/xray/use-peers";
import { formatCurrency } from "@/lib/xray/format";
import { clearDealsForCompanies, fetchDeal } from "@/lib/xray/deals";
import { onDataImported } from "@/lib/xray/import-events";
import type { AcceptedDeal } from "@/lib/xray/types";

function ScorePageInner({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const { data: score, loading } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies, addImported } = useCompanies();
  const { data: peers } = usePeers(companyId);
  const company = companies.find((c) => c.company_id === companyId);
  const [importOpen, setImportOpen] = useState(false);
  const [deal, setDeal] = useState<AcceptedDeal | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDeal(companyId).then((d) => {
      if (!cancelled) setDeal(d);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, searchParams]);

  useEffect(() => {
    return onDataImported((ids) => {
      void clearDealsForCompanies(ids.length ? ids : [companyId]).then(() => {
        if (ids.length === 0 || ids.includes(companyId)) {
          void fetchDeal(companyId).then(setDeal);
        }
      });
    });
  }, [companyId]);

  const closed = Boolean(deal) || searchParams.get("closed") === "1";

  const actionsPanel =
    closed || loading || !score ? null : (
      <section className="space-y-3">
        <h2 className="font-heading text-sm font-medium">
          Acciones recomendadas
        </h2>
        <div className="grid gap-3">
          {actionsLoading ? (
            <>
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </>
          ) : actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguna acción recomendada para esta empresa.
            </p>
          ) : (
            actions.map((a) => (
              <ActionCard
                key={a.id}
                action={a}
                snapshot={score}
                currency={company?.currency ?? "EUR"}
                href={`/c/${companyId}/a/${a.id}`}
              />
            ))
          )}
        </div>
      </section>
    );

  return (
    <AppShell
      crumbs={[
        {
          label: company?.name ?? companyId,
          href: `/c/${companyId}`,
        },
      ]}
      trailing={
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <UploadIcon data-icon="inline-start" />
          Actualizar datos
        </Button>
      }
    >
      {loading || !score ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-10">
          <ScoreOverview
            snapshot={score}
            peers={peers}
            currency={company?.currency ?? "EUR"}
            actions={actionsPanel}
            extras={
              deal ? (
                <Alert className="sm:col-span-2">
                  <AlertTitle>Oferta aceptada</AlertTitle>
                  <AlertDescription>
                    <span className="block">
                      {deal.label} · {deal.issuer_name} ·{" "}
                      {formatCurrency(deal.amount, company?.currency ?? "EUR")}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        Impacto what-if (no recalcula el Health Score oficial):
                      </span>
                      <ScoreUplift
                        uplift={deal.uplift}
                        toBand={deal.projected_band}
                      />
                    </span>
                  </AlertDescription>
                </Alert>
              ) : closed ? (
                <Alert className="sm:col-span-2">
                  <AlertTitle>Oferta cerrada</AlertTitle>
                  <AlertDescription>
                    La solicitud se aprobó. No hay más acciones recomendadas en
                    esta ficha.
                  </AlertDescription>
                </Alert>
              ) : null
            }
          />
        </div>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(imported) => {
          addImported(imported);
        }}
        targetCompanyId={companyId}
        companies={companies}
      />
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
        <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
      }
    >
      <ScorePageInner companyId={companyId} />
    </Suspense>
  );
}
