"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AccionesCard,
  ActualizacionesCard,
  DealFichaCard,
  FichaFrame,
  FichaSkeleton,
  HealthScoreCard,
  pickBannerAlert,
  TrajectoryCard,
} from "@/components/embat/ficha";
import { PeersBenchmarkCard } from "@/components/embat/peers-benchmark";
import { SignalsDialog } from "@/components/embat/signals-dialog";
import { TreasuryChartCard } from "@/components/embat/treasury-chart";
import { EmptyState, ErrorState } from "@/components/xray/feedback-state";
import { useActions } from "@/hooks/xray/use-actions";
import { useCashHistory } from "@/hooks/xray/use-cash-history";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { usePeers } from "@/hooks/xray/use-peers";
import { clearDealsForCompanies, fetchDeal } from "@/lib/xray/deals";
import { onDataImported } from "@/lib/xray/import-events";
import type { AcceptedDeal, Driver } from "@/lib/xray/types";
import type { SignalDotMonth } from "@/components/xray/score-trajectory";

function buildSignalDots(
  drivers: Driver[],
  history: { month: string; score: number }[],
  nRed: number,
  asOfMonth: string
): SignalDotMonth[] {
  const byMonth = new Map<string, Driver[]>();
  for (const d of drivers) {
    const list = byMonth.get(d.since) ?? [];
    list.push(d);
    byMonth.set(d.since, list);
  }
  if (nRed > 0 && !byMonth.has(asOfMonth)) {
    byMonth.set(asOfMonth, []);
  }
  const scoreByMonth = new Map(history.map((h) => [h.month, h.score]));
  return [...byMonth.entries()]
    .map(([month, ds]) => ({
      month,
      score: scoreByMonth.get(month) ?? 0,
      drivers: ds,
    }))
    .filter((d) => scoreByMonth.has(d.month) || d.drivers.length > 0);
}

export function Compania({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const { data: score, loading, error } = useCompanyScore(companyId);
  const {
    data: actions,
    loading: actionsLoading,
    error: actionsError,
  } = useActions(companyId);
  const { data: companies } = useCompanies();
  const { data: peers, error: peersError, loading: peersLoading } =
    usePeers(companyId);
  const {
    data: cashHistory,
    error: cashError,
    loading: cashLoading,
  } = useCashHistory(companyId);
  const company = companies.find((c) => c.company_id === companyId);
  const currency = company?.currency ?? "EUR";
  const banner = score ? pickBannerAlert(score.alerts) : null;
  const [deal, setDeal] = useState<AcceptedDeal | null>(null);
  const [signalsOpen, setSignalsOpen] = useState(false);

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

  const signalDots = useMemo(() => {
    if (!score) return [];
    return buildSignalDots(
      score.drivers,
      score.history,
      score.n_red,
      score.month
    );
  }, [score]);

  return (
    <FichaFrame banner={banner} actionsHref="#acciones">
      {loading ? (
        <FichaSkeleton />
      ) : error || !score ? (
        <ErrorState
          title="No se ha podido cargar la ficha"
          description={
            error?.message ??
            "No se ha podido cargar el score de esta compañía."
          }
          placement="page"
        />
      ) : (
        <div className="flex flex-col gap-[30px]">
          <div className="flex flex-wrap items-stretch gap-[30px]">
            <HealthScoreCard
              snapshot={score}
              onOpenSignals={() => setSignalsOpen(true)}
              actionsHref="#acciones"
            />
            <ActualizacionesCard drivers={score.drivers} />
            {peersError ? (
              <ErrorState
                title="No se han podido cargar los pares"
                description={peersError.message}
                placement="card"
                className="min-w-[260px] flex-1"
              />
            ) : peersLoading ? null : peers && peers.k > 0 ? (
              <PeersBenchmarkCard
                cohort={peers}
                peerPercentile={score.peer_percentile}
                companyScore={score.score}
              />
            ) : (
              <EmptyState
                title="Sin pares"
                description="No hay cohortes de pares para esta empresa."
                placement="card"
                className="min-w-[260px] flex-1"
              />
            )}
          </div>

          <div className="flex flex-wrap items-stretch gap-[30px]">
            <TrajectoryCard
              history={score.history}
              projection={score.projection_6m}
              signalDots={signalDots}
            />
            {cashError ? (
              <ErrorState
                title="No se ha podido cargar la tesorería"
                description={cashError.message}
                placement="card"
                className="min-w-[260px] flex-1"
              />
            ) : (
              <TreasuryChartCard
                history={cashLoading ? [] : cashHistory}
                treasury={score.treasury}
                currency={currency}
              />
            )}
          </div>

          <AccionesCard
            actions={closed ? [] : actions}
            loading={actionsLoading}
            error={closed ? null : actionsError}
            snapshot={score}
            currency={currency}
            hrefFor={(action) => `/c/${companyId}/a/${action.id}`}
            empty={
              closed
                ? "Oferta cerrada. No hay más acciones recomendadas en esta ficha."
                : "Ninguna acción recomendada para esta empresa."
            }
          />

          {deal ? (
            <DealFichaCard deal={deal} currency={currency} />
          ) : null}

          <SignalsDialog
            open={signalsOpen}
            onOpenChange={setSignalsOpen}
            snapshot={score}
          />
        </div>
      )}
    </FichaFrame>
  );
}
