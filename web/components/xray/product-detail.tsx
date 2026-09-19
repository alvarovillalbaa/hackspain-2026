"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/xray/format";
import { termImprovements } from "@/lib/xray/term-improvements";
import { saveDeal } from "@/lib/xray/deals";
import type {
  NegotiationLever,
  ProductMatch,
  ScoreSnapshot,
  TermContext,
} from "@/lib/xray/types";
import { MatchBreakdownBars } from "./match-breakdown";
import { NegotiationLevers } from "./negotiation-levers";
import { TermImprovementList } from "./term-improvement-list";
import { OfferRequestBar } from "./offer-request-bar";
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
    <div className="pb-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span>{match.product.product_id}</span>
            <ReasoningHint text={reasoning || null} />
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {match.product.label}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {match.product.description} · {formatCurrency(match.amount)}
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-3 rounded-2xl bg-muted/40 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Uplift proyectado del score
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

      <section className="mb-8 space-y-3">
        <h2 className="font-heading text-sm font-medium">Match bilateral</h2>
        <MatchBreakdownBars breakdown={match.breakdown} />
      </section>

      <Separator className="mb-8" />

      <section className="mb-8 space-y-3">
        <h2 className="font-heading text-sm font-medium">
          Términos — emisor vs ideal cliente
        </h2>
        <p className="text-sm text-muted-foreground">
          La oferta del emisor maximiza su margen; el ideal del cliente maximiza
          el uplift del score bajo DSCR ≥ 1,2×. El hueco es la superficie de
          negociación.
        </p>
        <TermsTable
          issuer={match.product.issuer_terms}
          ideal={match.product.client_ideal_terms}
        />
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-heading text-sm font-medium">
          Cómo mejorar los términos (lado empresa)
        </h2>
        <TermImprovementList tips={tips} />
      </section>

      <section className="mb-4 space-y-3">
        <h2 className="font-heading text-sm font-medium">
          Palancas para negociar términos
        </h2>
        <NegotiationLevers levers={levers} />
      </section>

      <OfferRequestBar onApprove={approve} />
    </div>
  );
}
