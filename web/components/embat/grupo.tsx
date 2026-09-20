"use client";

import Link from "next/link";
import {
  AccionesCard,
  ActualizacionesCard,
  FichaFrame,
  fichaCardClass,
  fichaItemClass,
  FichaSkeleton,
  HealthScoreCard,
  pickBannerAlert,
  TrajectoryCard,
} from "@/components/embat/ficha";
import { DemoChip, scoreBadgeClass, statusClass } from "@/components/embat/chrome";
import { ErrorState } from "@/components/xray/feedback-state";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useDemoSession } from "@/hooks/xray/use-demo-session";
import { useGroupActions, type GroupAction } from "@/hooks/xray/use-group-actions";
import { useGroupScore } from "@/hooks/xray/use-group-score";
import { outlookMeta } from "@/lib/xray/bands";
import type { GroupMemberScore, GroupScore } from "@/lib/xray/group-score";
import type { CompanySummary } from "@/lib/xray/company-summary";
import { cn } from "@/lib/utils";

export function Grupo({ groupId }: { groupId: string }) {
  const { data: group, loading, error } = useGroupScore(groupId);
  const { data: summaries } = useCompanySummaries();
  const focusGroupId = useDemoSession();
  const members = group?.members ?? [];
  const {
    data: actions,
    loading: actionsLoading,
    error: actionsError,
  } = useGroupActions(members);
  const banner = group ? pickBannerAlert(group.snapshot.alerts) : null;

  return (
    <FichaFrame banner={banner}>
      {loading ? (
        <FichaSkeleton />
      ) : error || !group ? (
        <ErrorState
          title="No se ha podido cargar el grupo"
          description={
            error?.message ?? "No se ha podido cargar el score de este grupo."
          }
          placement="page"
        />
      ) : (
        <GrupoBody
          groupId={groupId}
          group={group}
          actions={actions}
          actionsLoading={actionsLoading}
          actionsError={actionsError}
          summaries={summaries}
          isDemoFocus={focusGroupId === groupId}
        />
      )}
    </FichaFrame>
  );
}

function GrupoBody({
  groupId,
  group,
  actions,
  actionsLoading,
  actionsError,
  summaries,
  isDemoFocus,
}: {
  groupId: string;
  group: GroupScore;
  actions: GroupAction[];
  actionsLoading: boolean;
  actionsError: Error | null;
  summaries: CompanySummary[];
  isDemoFocus: boolean;
}) {
  const score = group.snapshot;
  const many = group.n_companies > 1;

  return (
    <>
      {isDemoFocus ? (
        <div className="px-5 pb-2">
          <DemoChip />
        </div>
      ) : null}
      <div className="flex flex-col gap-[30px]">
        <div className="flex flex-wrap items-stretch gap-[30px]">
          <HealthScoreCard snapshot={score} onOpenSignals={() => {}} />
          <ActualizacionesCard drivers={score.drivers} />
        </div>
        <AccionesCard
          actions={actions}
          loading={actionsLoading}
          error={actionsError}
          snapshot={score}
          hrefFor={(action) => `/c/${action.company_id}/a/${action.id}`}
          subtitleFor={many ? (action) => action.company_name : undefined}
          empty="Ninguna acción recomendada para las empresas de este grupo."
        />
        <TrajectoryCard
          history={score.history}
          projection={score.projection_6m}
        />
        <EmpresasCard members={group.members} summaries={summaries} />
      </div>
    </>
  );
}

function EmpresasCard({
  members,
  summaries,
}: {
  members: GroupMemberScore[];
  summaries: CompanySummary[];
}) {
  const byId = new Map(summaries.map((s) => [s.company_id, s] as const));
  return (
    <section
      className={cn(fichaCardClass, "min-w-0")}
      aria-labelledby="empresas-grupo"
    >
      <header className="px-5 py-[15px]">
        <h2
          id="empresas-grupo"
          className="text-[14px] font-medium tracking-[-0.14px] text-table-header"
        >
          Empresas del grupo
        </h2>
      </header>
      <div className="flex flex-col gap-1 p-[15px]">
        {members.map((m) => {
          const summary = byId.get(m.company_id);
          const outlook = summary?.outlook ?? "stable";
          return (
            <Link
              key={m.company_id}
              href={`/c/${m.company_id}`}
              className={cn(fichaItemClass, "hover:bg-[rgba(220,224,230,0.45)]")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium tracking-[-0.15px] text-muted-foreground">
                  {m.name}
                </p>
                <p className="text-[12px] text-table-header">{m.company_id}</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center rounded-xl border px-1 py-0.5 text-[12px] font-medium",
                  statusClass(outlook)
                )}
              >
                {outlookMeta(outlook).label}
              </span>
              <span
                className={cn(
                  "ml-2 inline-flex items-center rounded-xl border px-1 py-0.5 text-[14px] font-medium tabular-nums",
                  scoreBadgeClass(m.score)
                )}
              >
                {Math.round(m.score)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
