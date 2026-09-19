"use client";

import { use } from "react";
import { AppShell } from "@/components/xray/app-shell";
import { ScoreOverview } from "@/components/xray/score-overview";
import { CompanyCard } from "@/components/xray/company-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupScore } from "@/hooks/xray/use-group-score";
import { useCompanies } from "@/hooks/xray/use-companies";

export default function GroupScorePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const { data: group, loading } = useGroupScore(groupId);
  const { data: companies } = useCompanies();
  const members = companies.filter((c) => c.group_id === groupId);

  return (
    <AppShell
      crumbs={[
        {
          label: groupId,
          href: `/g/${groupId}`,
        },
      ]}
    >
      {loading || !group ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-10">
          <ScoreOverview
            snapshot={group.snapshot}
            title={groupId}
            subtitle={`Financial Health Score · ${group.n_companies} empresa${
              group.n_companies === 1 ? "" : "s"
            } · más débil ${group.weakest_company_id} (${group.score_min.toFixed(1)}) · confianza ${group.snapshot.confidence}`}
          />

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-semibold">Empresas del grupo</h2>
            <p className="text-sm text-muted-foreground">
              Score de grupo ponderado por entradas. Sin acciones de agente.
            </p>
            <div className="space-y-2">
              {(members.length ? members : group.members.map((m) => ({
                company_id: m.company_id,
                group_id: groupId,
                name: m.name,
                country: null,
                currency: "EUR",
                n_companies_in_group: group.n_companies,
              }))).map((c) => (
                <CompanyCard key={c.company_id} company={c} />
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
