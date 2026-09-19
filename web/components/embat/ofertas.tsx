"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FichaFrame, pickBannerAlert } from "@/components/embat/ficha";
import { ContratarPrestamoDialog } from "@/components/embat/contratar-prestamo";
import { embatDisplayClass } from "@/components/embat/font";
import {
  FeeBadge,
  formatSavingPerYear,
  IssuerMark,
  SignedMetricBadge,
} from "@/components/embat/offer-ui";
import { AmortizeDashboard } from "@/components/xray/amortize-dashboard";
import { useActions } from "@/hooks/xray/use-actions";
import { useCompanies } from "@/hooks/xray/use-companies";
import { useCompanyScore } from "@/hooks/xray/use-company-score";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import { useProductMatches } from "@/hooks/xray/use-product-matches";
import {
  formatCompactEuro,
  formatRatePct,
} from "@/lib/xray/format";
import {
  annualInterestSaving,
  embatOriginationFee,
  scoreImprovement,
} from "@/lib/xray/offer-metrics";
import type { ProductMatch } from "@/lib/xray/types";

const COLUMNS = [
  "Entidad",
  "Ahorro €/año",
  "Mejora de score",
  "Importe",
  "Tipo",
  "Fee Embat",
] as const;

function OfferRow({
  match,
  currentRate,
  onSelect,
}: {
  match: ProductMatch;
  currentRate: number | null;
  onSelect: (match: ProductMatch) => void;
}) {
  const offerRate = match.product.issuer_terms.rate_annual;
  const saving = annualInterestSaving(match.amount, currentRate, offerRate);
  const uplift = scoreImprovement(match.uplift);
  const fee = embatOriginationFee(match.amount);
  const issuer = match.product.issuer.name;

  return (
    <tr
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`Contratar préstamo con ${issuer}`}
      className="cursor-pointer border-b border-[#dce0e6] even:bg-[rgba(220,224,230,0.3)] hover:bg-[rgba(17,168,255,0.08)] focus-visible:bg-[rgba(17,168,255,0.08)] focus-visible:outline-none"
      onClick={() => onSelect(match)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(match);
        }
      }}
    >
      <td className="overflow-hidden px-3 py-[15px] first:pl-5">
        <IssuerMark name={issuer} />
      </td>
      <td className="px-3 py-[15px]">
        {saving === 0 ? (
          <span className="text-[14px] font-medium tracking-[-0.14px] text-[#666]">
            —
          </span>
        ) : (
          <SignedMetricBadge value={saving}>
            {formatSavingPerYear(saving)}
          </SignedMetricBadge>
        )}
      </td>
      <td className="px-3 py-[15px]">
        <SignedMetricBadge value={uplift}>{String(uplift)}</SignedMetricBadge>
      </td>
      <td className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]">
        {formatCompactEuro(match.amount)}
      </td>
      <td className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]">
        {formatRatePct(offerRate)}
      </td>
      <td className="px-3 py-[15px] pr-5">
        <FeeBadge amount={fee} />
      </td>
    </tr>
  );
}

export function Ofertas({
  companyId,
  actionId,
}: {
  companyId: string;
  actionId: string;
}) {
  const { data: companies } = useCompanies();
  const company = companies.find((c) => c.company_id === companyId);
  const name = company?.name ?? companyId;
  const { data: actions, loading: actionsLoading } = useActions(companyId);
  const action = actions.find((a) => a.id === actionId);
  const { data: score, loading: scoreLoading } = useCompanyScore(companyId);
  const { data: summaries } = useCompanySummaries();
  const currentRate =
    summaries.find((s) => s.company_id === companyId)?.implied_rate ?? null;
  const isAmortize = action?.kind === "amortize";
  const { data: matches, loading: matchesLoading, error: matchesError } =
    useProductMatches(
      isAmortize ? undefined : companyId,
      isAmortize || !action ? undefined : actionId
    );
  const banner = score ? pickBannerAlert(score.alerts) : null;
  const loading = actionsLoading || scoreLoading || (!isAmortize && matchesLoading);
  const [selected, setSelected] = useState<ProductMatch | null>(null);

  if (isAmortize) {
    return (
      <FichaFrame banner={banner}>
        {action && score ? (
          <AmortizeDashboard
            companyId={companyId}
            action={action}
            score={score}
          />
        ) : (
          <Skeleton className="h-48 w-full rounded-[8px] bg-[#dce0e6]/50" />
        )}
      </FichaFrame>
    );
  }

  return (
    <FichaFrame banner={banner}>
      <h1
        className={`${embatDisplayClass} px-5 pb-[15px] text-[20px] font-medium tracking-[-0.3px] text-black`}
      >
        Ofertas de financiación para {name}
      </h1>
      <section
        className="w-full overflow-x-auto overflow-y-hidden rounded-[8px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]"
        aria-labelledby="ofertas-financiacion"
      >
        <h2 id="ofertas-financiacion" className="sr-only">
          Ofertas de financiación
        </h2>
        <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
          <caption className="sr-only">
            Ofertas de financiación para {name}
          </caption>
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[16%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[#dce0e6]">
              {COLUMNS.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-3 py-[15px] text-[14px] font-medium tracking-[-0.14px] whitespace-nowrap text-[#999] first:pl-5 last:pr-5"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-[#dce0e6]">
                  <td colSpan={6} className="px-5 py-3">
                    <Skeleton className="h-4 w-full rounded bg-[#dce0e6]/50" />
                  </td>
                </tr>
              ))
            ) : !action ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-[14px] text-[#e61847]">
                  No se ha encontrado esta acción.
                </td>
              </tr>
            ) : matchesError ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-[14px] text-[#e61847]">
                  No se han podido cargar las ofertas. {matchesError.message}
                </td>
              </tr>
            ) : matches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-[14px] text-[#666]">
                  Sin ofertas para esta acción.
                </td>
              </tr>
            ) : (
              matches.map((match) => (
                <OfferRow
                  key={match.product.product_id}
                  match={match}
                  currentRate={currentRate}
                  onSelect={setSelected}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
      {selected ? (
        <ContratarPrestamoDialog
          match={selected}
          currentRate={currentRate}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </FichaFrame>
  );
}
