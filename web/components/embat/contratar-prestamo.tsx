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
import { embatFocusRing } from "@/components/embat/chrome";
import {
  FeeBadge,
  formatSavingPerYear,
  IssuerMark,
  SignedMetricBadge,
} from "@/components/embat/offer-ui";
import { useOfferRequest } from "@/hooks/xray/use-offer-request";
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
        "flex w-full items-center justify-between px-5 py-[15px] text-[14px] font-medium tracking-[-0.14px] text-muted-foreground",
        last
          ? "bg-[rgba(220,224,230,0.3)]"
          : "border-b border-border"
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
  open,
  onOpenChange,
  onApprove,
}: {
  match: ProductMatch;
  currentRate: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void | Promise<void>;
}) {
  const [approving, setApproving] = useState(false);
  const { phase, progress, remainingSec, start, cancel, isPending, isReady } =
    useOfferRequest(10_000);
  const onApproveRef = useRef(onApprove);
  onApproveRef.current = onApprove;

  const issuer = match.product.issuer.name;
  const offerRate = match.product.issuer_terms.rate_annual;
  const saving = annualInterestSaving(match.amount, currentRate, offerRate);
  const uplift = scoreImprovement(match.uplift);
  const fee = embatOriginationFee(match.amount);
  const total = loanTotal(match.amount);

  useEffect(() => {
    if (!open) {
      cancel();
      setApproving(false);
    }
  }, [open, cancel]);

  useEffect(() => {
    if (!isReady || !approving) return;
    let cancelled = false;
    void (async () => {
      try {
        await onApproveRef.current();
      } finally {
        if (!cancelled) {
          setApproving(false);
          onOpenChange(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, approving, onOpenChange]);

  const busy = isPending || approving;

  return (
    <Dialog
      open={open}
      disablePointerDismissal={busy}
      onOpenChange={(next) => {
        if (!next && busy) return;
        if (!next) cancel();
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        overlayClassName="embat-contratar-overlay bg-[rgba(0,0,0,0.3)] duration-200 data-closed:animate-none"
        className={cn(
          embatUiClass,
          "embat-contratar-dialog flex w-[700px] max-w-[calc(100%-2rem)] origin-top gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-black shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)] ring-0 sm:max-w-[700px] data-open:animate-none data-closed:animate-none"
        )}
        aria-busy={busy}
      >
        <DialogTitle className="sr-only">
          Contratar préstamo con {issuer}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {match.product.label}. Importe {formatCompactEuro(match.amount)}, tipo{" "}
          {formatRatePct(offerRate)}, fee Embat {formatCompactEuro(fee)}.
        </DialogDescription>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-5 self-stretch overflow-hidden border-r border-border p-2.5">
          <p className="text-[18px] font-medium tracking-[-0.18px] text-black">
            X Ray
          </p>
          <FeeBadge amount={fee} prefix="Comisión de operación: " />
          {isPending ? (
            <div className="w-full max-w-[200px] space-y-2 px-4">
              <p className="text-center text-[12px] font-medium text-muted-foreground">
                El emisor revisa… {remainingSec}s
              </p>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[#dce0e6]"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-100 motion-reduce:transition-none"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5 overflow-hidden p-2.5">
          <div className="flex w-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-[0px_1px_2px_0px_rgba(13,19,30,0.1)]">
            <div className="flex w-full items-center justify-center border-b border-border px-5 py-[15px]">
              <IssuerMark name={issuer} />
            </div>
            <OfferStat label="Ahorro €/año">
              {saving === 0 ? (
                <span className="text-[14px] font-medium tracking-[-0.14px] text-muted-foreground">
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
            <OfferStat label="Comisión Embat">
              <FeeBadge amount={fee} />
            </OfferStat>
            <OfferStat label="Total Préstamo" last>
              <span>{formatCompactEuro(total)}</span>
            </OfferStat>
          </div>

          {phase === "idle" ? (
            <button
              type="button"
              onClick={start}
              className={cn(
                "flex h-8 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary px-2.5 text-[15px] leading-none font-semibold tracking-[-0.15px] text-white outline-none transition-colors duration-150 ease-out motion-reduce:transition-none",
                embatFocusRing
              )}
            >
              Solicitar
            </button>
          ) : null}

          {isPending ? (
            <button
              type="button"
              onClick={cancel}
              className={cn(
                "flex h-8 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white px-2.5 text-[15px] leading-none font-semibold tracking-[-0.15px] text-muted-foreground transition-colors duration-150 ease-out motion-reduce:transition-none",
                embatFocusRing
              )}
            >
              Cancelar
            </button>
          ) : null}

          {isReady ? (
            <button
              type="button"
              disabled={approving}
              aria-busy={approving}
              onClick={() => setApproving(true)}
              className={cn(
                "flex h-8 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary px-2.5 text-[15px] leading-none font-semibold tracking-[-0.15px] text-white outline-none transition-colors duration-150 ease-out motion-reduce:transition-none disabled:cursor-wait",
                embatFocusRing
              )}
            >
              {approving ? (
                <>
                  <Loader2Icon
                    aria-hidden
                    className="size-4 animate-spin text-white motion-reduce:animate-none"
                  />
                  <span className="sr-only">Aprobando</span>
                </>
              ) : (
                "Aprobar oferta"
              )}
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
