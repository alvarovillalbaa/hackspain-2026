"use client";

import { Button } from "@/components/ui/button";
import { useOfferRequest } from "@/hooks/xray/use-offer-request";

export function OfferRequestBar({
  onApprove,
  disabled,
}: {
  onApprove: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { phase, progress, remainingSec, start, cancel, isPending, isReady } =
    useOfferRequest(10_000);

  return (
    <div className="sticky bottom-0 z-10 -mx-2 border-t bg-background/95 px-2 py-4 backdrop-blur sm:-mx-3 sm:px-3">
      {isPending ? (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              El emisor está revisando la solicitud…
            </span>
            <span className="font-mono tabular-nums">{remainingSec}s</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      {isReady ? (
        <p className="mb-3 text-sm text-muted-foreground">
          El emisor ha respondido. Puedes aprobar la oferta.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" ? (
          <Button
            size="lg"
            onClick={start}
            disabled={disabled}
          >
            Solicitar
          </Button>
        ) : null}

        {isPending ? (
          <>
            <Button size="lg" disabled>
              Esperando respuesta…
            </Button>
            <Button size="lg" variant="outline" onClick={cancel}>
              Cancelar
            </Button>
          </>
        ) : null}

        {isReady ? (
          <>
            <Button size="lg" onClick={onApprove} disabled={disabled}>
              Aprobar
            </Button>
            <Button size="lg" variant="outline" onClick={cancel}>
              Cancelar
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
