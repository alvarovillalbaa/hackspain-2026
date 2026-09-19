"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { useSelection } from "@/hooks/xray/use-selection";
import { formatCurrency } from "@/lib/xray/format";
import { clearDealsForCompanies, fetchDeal } from "@/lib/xray/deals";
import { onDataImported } from "@/lib/xray/import-events";
import { publishedProjectionMany } from "@/lib/xray/scoring";
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
  const selection = useSelection<string>();

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

  const combined = useMemo(() => {
    if (!score) return null;
    const selected = actions.filter((a) => selection.values.includes(a.id));
    if (selected.length === 0) return null;
    return publishedProjectionMany(score, selected);
  }, [score, actions, selection.values]);

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
            title={company?.name ?? companyId}
            peers={peers}
            currency={company?.currency ?? "EUR"}
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
          {closed ? null : (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-heading text-xl font-semibold">
                    Acciones recomendadas
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {actionsLoading
                      ? "El agente está calculando las acciones…"
                      : "Selecciona una o varias; el score se recálcula con las mismas reglas."}
                  </p>
                </div>
                {combined ? (
                  <ScoreUplift
                    from={combined.before}
                    to={combined.after}
                    uplift={combined.uplift}
                    toBand={combined.toBand}
                  />
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {actionsLoading ? (
                  <>
                    <Skeleton className="h-40 rounded-2xl" />
                    <Skeleton className="h-40 rounded-2xl" />
                  </>
                ) : actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground md:col-span-2">
                    Ninguna acción recomendada para esta empresa.
                  </p>
                ) : (
                  actions.map((a) => (
                    <ActionCard
                      key={a.id}
                      action={a}
                      snapshot={score}
                      currency={company?.currency ?? "EUR"}
                      selected={selection.isSelected(a.id)}
                      onToggle={() => selection.toggle(a.id)}
                      href={`/c/${companyId}/a/${a.id}`}
                    />
                  ))
                )}
              </div>
              {selection.count === 1 ? (
                <p className="text-sm">
                  <Link
                    href={`/c/${companyId}/a/${selection.values[0]}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {actions.find((a) => a.id === selection.values[0])?.kind ===
                    "amortize"
                      ? "Abrir impacto de la acción seleccionada →"
                      : "Abrir marketplace de la acción seleccionada →"}
                  </Link>
                </p>
              ) : null}
            </section>
          )}
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
