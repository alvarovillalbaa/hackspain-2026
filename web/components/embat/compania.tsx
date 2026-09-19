"use client";

import {
  AccionesCard,
  ActualizacionesCard,
  DesgloseCard,
  FichaChips,
  FichaFrame,
  FichaGauge,
  FichaSkeleton,
  FichaTitle,
  pickBannerAlert,
  TrajectoryCard,
} from "@/components/embat/ficha";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";

export function Compania({ companyId }: { companyId: string }) {
  const { data: score, loading, error } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const name = company?.name ?? companyId;
  const banner = score ? pickBannerAlert(score.alerts) : null;

  return (
    <FichaFrame banner={banner}>
      {loading ? (
        <FichaSkeleton />
      ) : error || !score ? (
        <p className="px-5 text-[14px] text-[#e61847]">
          {error?.message ?? "No se ha podido cargar el score de esta compañía."}
        </p>
      ) : (
        <>
          <FichaTitle name={name} month={score.month} />
          <FichaChips id={companyId} outlook={score.outlook} />
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
                hrefFor={(action) => `/c/${companyId}/a/${action.id}`}
                empty="Ninguna acción recomendada para esta empresa."
              />
              <TrajectoryCard
                history={score.history}
                projection={score.projection_6m}
              />
            </div>
          </div>
        </>
      )}
    </FichaFrame>
  );
}
