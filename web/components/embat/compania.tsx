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
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const { data: companies } = useCompanies();
  const { data: peers } = usePeers(companyId);
  const { data: cashHistory } = useCashHistory(companyId);
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
    <FichaFrame banner={banner}>
      {loading ? (
        <FichaSkeleton />
      ) : error || !score ? (
        <p className="px-5 text-[14px] text-destructive">
          {error?.message ??
            "No se ha podido cargar el score de esta compañía."}
        </p>
      ) : (
        <div className="flex flex-col gap-[30px]">
          <div className="flex flex-wrap items-stretch gap-[30px]">
            <HealthScoreCard
              snapshot={score}
              onOpenSignals={() => setSignalsOpen(true)}
            />
            <ActualizacionesCard drivers={score.drivers} />
            {peers && peers.k > 0 ? (
              <PeersBenchmarkCard
                cohort={peers}
                peerPercentile={score.peer_percentile}
                companyScore={score.score}
              />
            ) : null}
          </div>

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

          <div className="flex flex-wrap items-stretch gap-[30px]">
            <TrajectoryCard
              history={score.history}
              projection={score.projection_6m}
              signalDots={signalDots}
            />
            <TreasuryChartCard
              history={cashHistory}
              treasury={score.treasury}
              currency={currency}
            />
          </div>

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
