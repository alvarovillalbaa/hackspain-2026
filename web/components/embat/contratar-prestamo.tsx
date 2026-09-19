"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { embatUiClass } from "@/components/embat/font";
import {
  FeeBadge,
  formatSavingPerYear,
  IssuerMark,
  SignedMetricBadge,
} from "@/components/embat/offer-ui";
import {
  formatCompactEuro,
  formatRatePct,
} from "@/lib/xray/format";
import {
  annualInterestSaving,
  embatOriginationFee,
  loanTotal,
  scoreImprovement,
} from "@/lib/xray/offer-metrics";
import type { ProductMatch } from "@/lib/xray/types";
import { cn } from "@/lib/utils";

const HIRE_DELAY_MS = 3000;

function OfferStat({
  label,
  last,
  children,
}: {
  label: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-between px-5 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-[#666]",
        last
          ? "bg-[rgba(220,224,230,0.3)]"
          : "border-b border-[#dce0e6]"
      )}
    >
      <span>{label}</span>
      {children}
    </div>
  );
}

export function ContratarPrestamoDialog({
  match,
  currentRate,
  onClose,
}: {
  match: ProductMatch;
  currentRate: number | null;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const issuer = match.product.issuer.name;
  const offerRate = match.product.issuer_terms.rate_annual;
  const saving = annualInterestSaving(match.amount, currentRate, offerRate);
  const uplift = scoreImprovement(match.uplift);
  const fee = embatOriginationFee(match.amount);
  const total = loanTotal(match.amount);

  useEffect(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!submitting) return;
    const id = window.setTimeout(() => {
      setOpen(false);
    }, HIRE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [submitting]);

  return (
    <Dialog
      open={open}
      disablePointerDismissal={submitting}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        setOpen(next);
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onCloseRef.current();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="embat-contratar-overlay bg-[rgba(0,0,0,0.3)] backdrop-blur-[4px] supports-backdrop-filter:backdrop-blur-[4px] duration-200 data-closed:animate-none"
        className={cn(
          embatUiClass,
          "embat-contratar-dialog flex w-[700px] max-w-[calc(100%-2rem)] origin-top gap-0 overflow-hidden rounded-[8px] border-0 bg-white p-0 text-black shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)] ring-0 sm:max-w-[700px] data-open:animate-none data-closed:animate-none"
        )}
        aria-busy={submitting}
      >
        <DialogTitle className="sr-only">
          Contratar préstamo con {issuer}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {match.product.label}. Importe {formatCompactEuro(match.amount)}, tipo{" "}
          {formatRatePct(offerRate)}, fee Embat {formatCompactEuro(fee)}.
        </DialogDescription>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-5 self-stretch overflow-hidden border-r border-[#dce0e6] p-2.5">
          <div className="relative h-5 w-[93px] shrink-0">
            <img
              src="/embat/logo-dark.svg"
              alt=""
              width={93}
              height={20}
              className="absolute inset-0 max-w-none size-full"
            />
          </div>
          <FeeBadge amount={fee} prefix="Fee operación: " angle={134} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 overflow-hidden p-2.5">
          <div className="flex w-full flex-col overflow-hidden rounded-[6px] border border-[#dce0e6] bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]">
            <div className="flex w-full items-center justify-center border-b border-[#dce0e6] px-5 py-[15px]">
              <IssuerMark name={issuer} />
            </div>
            <OfferStat label="Ahorro €/año">
              {saving === 0 ? (
                <span className="text-[14px] font-medium tracking-[-0.14px] text-[#666]">
                  —
                </span>
              ) : (
                <SignedMetricBadge value={saving}>
                  {formatSavingPerYear(saving)}
                </SignedMetricBadge>
              )}
            </OfferStat>
            <OfferStat label="Mejora de Score">
              <SignedMetricBadge value={uplift}>{String(uplift)}</SignedMetricBadge>
            </OfferStat>
            <OfferStat label="Importe">
              <span>{formatCompactEuro(match.amount)}</span>
            </OfferStat>
            <OfferStat label="Tipo">
              <span>{formatRatePct(offerRate)}</span>
            </OfferStat>
            <OfferStat label="Fee Embat">
              <FeeBadge amount={fee} />
            </OfferStat>
            <OfferStat label="Total Préstamo" last>
              <span>{formatCompactEuro(total)}</span>
            </OfferStat>
          </div>

          <button
            type="button"
            disabled={submitting}
            aria-busy={submitting}
            onClick={() => setSubmitting(true)}
            className="flex h-8 w-full shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[#11a8ff] px-2.5 text-[15px] leading-none font-semibold tracking-[-0.15px] text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-100"
          >
            {submitting ? (
              <>
                <Loader2Icon
                  aria-hidden
                  className="size-4 animate-spin text-white"
                />
                <span className="sr-only">Contratando préstamo</span>
              </>
            ) : (
              "Contratar Préstamo"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
