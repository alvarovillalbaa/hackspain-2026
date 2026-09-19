"use client";

import { motion } from "motion/react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/xray/format";
import type { NegotiationLever, ProductMatch } from "@/lib/xray/types";
import { MatchBreakdownBars } from "./match-breakdown";
import { NegotiationLevers } from "./negotiation-levers";
import { OriginChip } from "./origin-chip";
import { ScoreUplift } from "./score-uplift";
import { TermsTable } from "./terms-table";

export function ProductDetail({
  match,
  levers,
  onClose,
}: {
  match: ProductMatch;
  levers: NegotiationLever[];
  onClose: () => void;
}) {
  return (
    <motion.div
      layoutId={`product-${match.product.product_id}`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <OriginChip origin={match.origin} />
              <span className="font-mono text-xs text-muted-foreground">
                {match.product.product_id}
              </span>
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {match.product.label}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {match.product.description} · {formatCurrency(match.amount)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <XIcon />
          </Button>
        </div>

        <div className="mb-6 flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            Uplift proyectado del score
          </span>
          <ScoreUplift uplift={match.uplift} toBand={match.projected_band} />
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

        <section className="space-y-3 pb-12">
          <h2 className="font-heading text-sm font-medium">
            Palancas para mejorar términos
          </h2>
          <NegotiationLevers levers={levers} />
        </section>
      </div>
    </motion.div>
  );
}
