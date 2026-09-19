"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AccionesCard,
  ActualizacionesCard,
  DealFichaCard,
  DesgloseCard,
  DimensionsFichaCard,
  FichaChips,
  FichaFrame,
  FichaGauge,
  FichaSkeleton,
  FichaTitle,
  PeersFichaCard,
  pickBannerAlert,
  TrajectoryCard,
} from "@/components/embat/ficha";
import { EmbatButton } from "@/components/embat/chrome";
import { ImportDialog } from "@/components/xray/import/import-dialog";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { usePeers } from "@/hooks/xray/use-peers";
import { watchMeta } from "@/lib/xray/bands";
import { clearDealsForCompanies, fetchDeal } from "@/lib/xray/deals";
import { onDataImported } from "@/lib/xray/import-events";
import type { AcceptedDeal } from "@/lib/xray/types";

export function Compania({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const { data: score, loading, error } = useCompanyScore(companyId);
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies, addImported } = useCompanies();
  const { data: peers } = usePeers(companyId);
  const company = companies.find((c) => c.company_id === companyId);
  const name = company?.name ?? companyId;
  const currency = company?.currency ?? "EUR";
  const banner = score ? pickBannerAlert(score.alerts) : null;
  const watch = watchMeta(score?.watch ?? null);
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

  return (
    <>
      <FichaFrame banner={banner}>
        {loading ? (
          <FichaSkeleton />
        ) : error || !score ? (
          <p className="px-5 text-[14px] text-[#e61847]">
            {error?.message ?? "No se ha podido cargar el score de esta compañía."}
          </p>
        ) : (
          <>
            <FichaTitle name={name} month={score.month}>
              <EmbatButton
                variant="secondary"
                onClick={() => setImportOpen(true)}
              >
                Actualizar datos
              </EmbatButton>
            </FichaTitle>
            <FichaChips id={companyId} outlook={score.outlook}>
              {watch.active ? (
                <span className="inline-flex items-center justify-center rounded-[4px] border border-[#fbd3dc] bg-[#fef4f6] px-1 py-0.5 text-[14px] font-medium tracking-[-0.14px] text-[#e61847]">
                  Watch
                </span>
              ) : null}
            </FichaChips>
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
                  actions={closed ? [] : actions}
                  loading={actionsLoading}
                  snapshot={score}
                  hrefFor={(action) => `/c/${companyId}/a/${action.id}`}
                  empty={
                    closed
                      ? "Oferta cerrada. No hay más acciones recomendadas en esta ficha."
                      : "Ninguna acción recomendada para esta empresa."
                  }
                />
                <TrajectoryCard
                  history={score.history}
                  projection={score.projection_6m}
                />
              </div>
              <div className="flex flex-wrap items-stretch gap-[30px]">
                <DimensionsFichaCard dimensions={score.dimensions} />
                {peers && peers.k > 0 ? (
                  <PeersFichaCard cohort={peers} currency={currency} />
                ) : null}
                {deal ? (
                  <DealFichaCard deal={deal} currency={currency} />
                ) : null}
              </div>
            </div>
          </>
        )}
      </FichaFrame>
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
