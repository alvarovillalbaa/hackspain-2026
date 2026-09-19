"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { UploadIcon } from "lucide-react";
import { AppShell } from "@/components/xray/app-shell";
import { ScoreOverview } from "@/components/xray/score-overview";
import { ActionCard } from "@/components/xray/action-card";
import { ScoreUplift } from "@/components/xray/score-uplift";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { usePeers } from "@/hooks/xray/use-peers";
import { useSelection } from "@/hooks/xray/use-selection";
import { publishedProjectionMany } from "@/lib/xray/scoring";

export default function ScorePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const { data: score, loading } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies, addImported } = useCompanies();
  const { data: peers } = usePeers(companyId);
  const company = companies.find((c) => c.company_id === companyId);
  const selection = useSelection<string>();
  const selectedIds = selection.values;
  const [importOpen, setImportOpen] = useState(false);

  const combined = useMemo(() => {
    if (!score) return null;
    const selected = actions.filter((a) => selectedIds.includes(a.id));
    if (selected.length === 0) return null;
    return publishedProjectionMany(score, selected);
  }, [score, actions, selectedIds]);

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
          />

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
        </div>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(imported) => {
          addImported(imported);
          selection.clear();
        }}
        targetCompanyId={companyId}
        companies={companies}
      />
    </AppShell>
  );
}
