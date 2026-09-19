"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ContratarPrestamoDialog } from "@/components/embat/contratar-prestamo";
import { Button } from "@/components/ui/button";
import { embatDisplayClass } from "@/components/embat/font";
import { formatCompactEuro, formatCurrency } from "@/lib/xray/format";
import { termImprovements } from "@/lib/xray/term-improvements";
import { saveDeal } from "@/lib/xray/deals";
import { useCompanySummaries } from "@/hooks/xray/use-company-summaries";
import type {
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
  TermContext,
} from "@/lib/xray/types";
import { MatchBreakdownBars } from "./match-breakdown";
import { NegotiationLevers } from "./negotiation-levers";
import { TermImprovementList } from "./term-improvement-list";
import { ReasoningHint } from "./reasoning-hint";
import { ScoreDeltaBar } from "./score-delta-bar";
import { ScoreUplift } from "./score-uplift";
import { TermsTable } from "./terms-table";

export function ProductDetail({
  match,
  levers,
  score,
  termContext,
  companyId,
  actionId,
}: {
  match: ProductMatch;
  levers: NegotiationLever[];
  score: ScoreSnapshot | null;
  termContext: TermContext | null;
  companyId: string;
  actionId: string;
}) {
  const router = useRouter();
  const [hireOpen, setHireOpen] = useState(false);
  const { data: summaries } = useCompanySummaries();
  const currentRate =
    summaries.find((s) => s.company_id === companyId)?.implied_rate ?? null;

  const tips = useMemo(() => {
    if (!score) return [];
    return termImprovements({ snapshot: score, context: termContext, match });
  }, [score, termContext, match]);

  const reasoning = [
    match.rationale,
    match.risks?.length ? `Riesgos: ${match.risks.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const approve = async () => {
    await saveDeal({
      company_id: companyId,
      action_id: actionId,
      product_id: match.product.product_id,
      label: match.product.label,
      issuer_name: match.product.issuer.name,
      amount: match.amount,
      projected_score: match.projected_score,
      projected_band: match.projected_band,
      uplift: match.uplift,
      accepted_at: new Date().toISOString(),
    });
    router.push(`/c/${companyId}?closed=1`);
  };

  return (
    <div className="flex flex-col gap-[30px] pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-[12px] font-medium tracking-[-0.12px] text-[#999]">
            <span className="font-mono">{match.product.product_id}</span>
            <ReasoningHint text={reasoning || null} />
          </div>
          <h1
            className={`${embatDisplayClass} text-[20px] font-medium tracking-[-0.3px] text-black`}
          >
            {match.product.label}
          </h1>
          <p className="mt-1 text-[14px] tracking-[-0.14px] text-[#666]">
            {match.product.description} ·{" "}
            {formatCurrency(match.amount) || formatCompactEuro(match.amount)}
          </p>
        </div>
        <Button className="rounded-xl" onClick={() => setHireOpen(true)}>
          Contratar préstamo
        </Button>
      </div>

      <div className="mx-5 space-y-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
            Mejora proyectada del score
          </span>
          <ScoreUplift uplift={match.uplift} toBand={match.projected_band} />
        </div>
        {score ? (
          <ScoreDeltaBar
            current={score.score}
            uplift={match.uplift}
            toBand={match.projected_band}
          />
        ) : null}
      </div>

      <section className="mx-5 space-y-3">
        <h2 className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
          Encaje bilateral
        </h2>
        <MatchBreakdownBars breakdown={match.breakdown} />
      </section>

      <section className="mx-5 space-y-3">
        <h2 className="text-[14px] font-medium tracking-[-0.14px] text-[#999]">
          Términos — emisor vs ideal cliente
        </h2>
        <p className="text-[13px] tracking-[-0.13px] text-[#666]">
          La oferta del emisor maximiza su margen; el ideal del cliente maximiza
          el uplift del score bajo DSCR ≥ 1,2×. El hueco es la superficie de
          negociación.
        </p>
        <TermsTable
          issuer={match.product.issuer_terms}
          ideal={match.product.client_ideal_terms}
        />
      </section>

      <section className="mx-5 space-y-3">
        <h2 className="text-[14px] font-medium tracking-[-0.14px] text-[#999]">
          Cómo mejorar los términos (lado empresa)
        </h2>
        <TermImprovementList tips={tips} />
      </section>

      <section className="mx-5 space-y-3">
        <h2 className="text-[14px] font-medium tracking-[-0.14px] text-[#999]">
          Palancas para negociar términos
        </h2>
        <NegotiationLevers levers={levers} />
      </section>

      <ContratarPrestamoDialog
        match={match}
        currentRate={currentRate}
        open={hireOpen}
        onOpenChange={setHireOpen}
        onApprove={approve}
      />
    </div>
  );
}
