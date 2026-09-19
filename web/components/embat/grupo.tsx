"use client";

import Link from "next/link";
import {
  AccionesCard,
  ActualizacionesCard,
  DesgloseCard,
  FichaChips,
  FichaFrame,
  FichaGauge,
  fichaCardClass,
  fichaItemClass,
  FichaSkeleton,
  FichaTitle,
  pickBannerAlert,
  TrajectoryCard,
} from "@/components/embat/ficha";
import { scoreBadgeClass, statusClass } from "@/components/embat/chrome";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useGroupActions, type GroupAction } from "@/hooks/xray/use-group-actions";
import { useGroupScore } from "@/hooks/xray/use-group-score";
import { useGroups } from "@/hooks/xray/use-groups";
import { outlookMeta } from "@/lib/xray/bands";
import type { GroupMemberScore, GroupScore } from "@/lib/xray/group-score";
import type { CompanySummary } from "@/lib/xray/company-summary";
import { cn } from "@/lib/utils";

export function Grupo({ groupId }: { groupId: string }) {
  const { data: group, loading, error } = useGroupScore(groupId);
  const { data: groups } = useGroups();
  const { data: summaries } = useCompanySummaries();
  const members = group?.members ?? [];
  const { data: actions, loading: actionsLoading } = useGroupActions(members);
  const summary = groups.find((g) => g.group_id === groupId);
  const name = summary?.name ?? members[0]?.name ?? groupId;
  const banner = group ? pickBannerAlert(group.snapshot.alerts) : null;

  return (
    <FichaFrame banner={banner}>
      {loading ? (
        <FichaSkeleton />
      ) : error || !group ? (
        <p className="px-5 text-[14px] text-[#e61847]">
          {error?.message ?? "No se ha podido cargar el score de este grupo."}
        </p>
      ) : (
        <GrupoBody
          groupId={groupId}
          name={name}
          group={group}
          actions={actions}
          actionsLoading={actionsLoading}
          summaries={summaries}
        />
      )}
    </FichaFrame>
  );
}

function GrupoBody({
  groupId,
  name,
  group,
  actions,
  actionsLoading,
  summaries,
}: {
  groupId: string;
  name: string;
  group: GroupScore;
  actions: GroupAction[];
  actionsLoading: boolean;
  summaries: CompanySummary[];
}) {
  const score = group.snapshot;
  const many = group.n_companies > 1;

  return (
    <>
      <FichaTitle name={name} month={score.month} />
      <FichaChips id={groupId} outlook={score.outlook} />
      <div className="flex flex-col gap-[30px]">
        <div className="flex flex-wrap items-center gap-[30px]">
          <FichaGauge
            score={score.score}
            band={score.band}
            outlook={score.outlook}
          />
          <DesgloseCard
            bankability={score.sub_scores.bankability}
            business={score.sub_scores.business_profile}
          />
          <ActualizacionesCard drivers={score.drivers} />
        </div>
        <div className="flex flex-wrap items-stretch gap-[30px]">
          <AccionesCard
            actions={actions}
            loading={actionsLoading}
            snapshot={score}
            hrefFor={(action) => `/c/${action.company_id}/a/${action.id}`}
            subtitleFor={many ? (action) => action.company_name : undefined}
            empty="Ninguna acción recomendada para las empresas de este grupo."
          />
          <TrajectoryCard
            history={score.history}
            projection={score.projection_6m}
          />
        </div>
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
  const byId = new Map(summaries.map((s) => [s.company_id, s]));

  return (
    <section
      className={cn(fichaCardClass, "min-h-0")}
      aria-labelledby="empresas-grupo"
    >
      <header className="border-b border-[#dce0e6] px-5 py-[15px]">
        <h2
          id="empresas-grupo"
          className="text-[14px] font-medium tracking-[-0.14px] text-[#999]"
        >
          Empresas del grupo
        </h2>
      </header>
      <div className="flex flex-col gap-2.5 p-[15px]">
        {members.length === 0 ? (
          <p className="px-2.5 text-[14px] text-[#666]">
            Este grupo no tiene empresas con score.
          </p>
        ) : (
          members.map((member) => {
            const summary = byId.get(member.company_id);
            const outlook = summary?.outlook;
            return (
              <Link
                key={member.company_id}
                href={`/c/${member.company_id}`}
                className={cn(
                  fichaItemClass,
                  "hover:bg-[rgba(220,224,230,0.45)]"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium tracking-[-0.15px] text-[#666]">
                    {member.name}
                  </p>
                  <p className="truncate text-[12px] font-medium tracking-[-0.12px] text-[#999]">
                    {member.company_id}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {outlook ? (
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                        statusClass(outlook)
                      )}
                    >
                      {outlookMeta(outlook).label}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-[4px] border px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px]",
                      scoreBadgeClass(member.score)
                    )}
                  >
                    {Math.round(member.score)}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
