"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type OfferRequestPhase = "idle" | "pending" | "ready";

const DEFAULT_MS = 10_000;

/**
 * Solicitar → 10s issuer review → ready for Aprobar.
 * Cancel resets to idle while pending.
 */
export function useOfferRequest(durationMs = DEFAULT_MS) {
  const [phase, setPhase] = useState<OfferRequestPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const startedAt = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (raf.current != null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    if (timeout.current != null) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    startedAt.current = null;
    setPhase("idle");
    setProgress(0);
    setRemainingMs(durationMs);
  }, [clearTimers, durationMs]);

  const start = useCallback(() => {
    clearTimers();
    startedAt.current = Date.now();
    setPhase("pending");
    setProgress(0);
    setRemainingMs(durationMs);

    const tick = () => {
      const startTs = startedAt.current;
      if (startTs == null) return;
      const elapsed = Date.now() - startTs;
      const p = Math.min(1, elapsed / durationMs);
      setProgress(p);
      setRemainingMs(Math.max(0, durationMs - elapsed));
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);

    timeout.current = setTimeout(() => {
      clearTimers();
      setPhase("ready");
      setProgress(1);
      setRemainingMs(0);
    }, durationMs);
  }, [clearTimers, durationMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase,
    progress,
    remainingMs,
    remainingSec: Math.ceil(remainingMs / 1000),
    start,
    cancel,
    isPending: phase === "pending",
    isReady: phase === "ready",
    isIdle: phase === "idle",
  };
}
