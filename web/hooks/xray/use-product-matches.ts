"use client";

import { useEffect, useState } from "react";
import { onDataImported } from "@/lib/xray/import-events";
import type { MarketplacePhase } from "@/lib/xray/marketplace-progress";
import type { QuantitySummary } from "@/lib/xray/recommend-cache";
import type { ProductMatch } from "@/lib/xray/types";
import { TimeoutError } from "@/lib/ai/errors";

export type RecommendPhase = MarketplacePhase;

export function useProductMatches(
  companyId: string | undefined,
  actionId: string | undefined,
  amount?: number
) {
  const key =
    companyId && actionId
      ? `${companyId}:${actionId}:${amount ?? "auto"}`
      : null;
  const [data, setData] = useState<ProductMatch[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecommendPhase>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<QuantitySummary | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return onDataImported((ids) => {
      if (!companyId) return;
      if (ids.length === 0 || ids.includes(companyId)) setTick((t) => t + 1);
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !actionId || !key) return;
    let cancelled = false;
    setPhase("queued");
    setDetail(null);
    setFetchedFor(null);
    setHeadline(null);
    setSource(null);
    setFallbackReason(null);
    setQuantity(null);

    const livePipeline = amount == null;
    const es = livePipeline
      ? new EventSource(
          `/api/xray/recommend/stream?company_id=${encodeURIComponent(companyId)}&action_id=${encodeURIComponent(actionId)}`
        )
      : null;
    if (es) {
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as {
            phase?: RecommendPhase;
            detail?: string;
          };
          if (msg.phase && !cancelled) {
            setPhase(msg.phase);
            if (msg.detail) setDetail(msg.detail);
          }
        } catch {
          /* ignore malformed */
        }
      };
    }

    void (async () => {
      try {
        const res = await fetch("/api/xray/recommend", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            action_id: actionId,
            amount,
          }),
        });
        const json = (await res.json()) as {
          matches?: ProductMatch[];
          headline?: string;
          source?: string;
          fallback_reason?: string;
          quantity?: QuantitySummary;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          if (res.status === 504 || json.code === "timeout") {
            throw new TimeoutError(
              json.error || "Se ha agotado el tiempo de espera del agente."
            );
          }
          throw new Error(json.error || `recommend HTTP ${res.status}`);
        }
        if (cancelled) return;
        setData(json.matches ?? []);
        setHeadline(json.headline ?? null);
        setSource(json.source ?? null);
        setFallbackReason(json.fallback_reason ?? null);
        setQuantity(json.quantity ?? null);
        setError(null);
        setFetchedFor(`${key}:${tick}`);
        setPhase((prev) =>
          json.source === "engine" || json.fallback_reason
            ? "fallback"
            : prev === "done"
              ? prev
              : "done"
        );
      } catch (e) {
        if (cancelled) return;
        setData([]);
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(`${key}:${tick}`);
        setHeadline(null);
        setSource(null);
        setFallbackReason(null);
        setPhase("idle");
      } finally {
        es?.close();
      }
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [companyId, actionId, amount, key, tick]);

  if (!key) {
    return {
      data: [] as ProductMatch[],
      loading: false,
      error: null,
      phase: "idle" as RecommendPhase,
      detail: null as string | null,
      headline: null as string | null,
      source: null as string | null,
      fallbackReason: null as string | null,
      quantity: null as QuantitySummary | null,
    };
  }

  const token = `${key}:${tick}`;
  return {
    data: fetchedFor === token ? data : [],
    loading: fetchedFor !== token,
    error: fetchedFor === token ? error : null,
    phase,
    detail,
    headline: fetchedFor === token ? headline : null,
    source: fetchedFor === token ? source : null,
    fallbackReason: fetchedFor === token ? fallbackReason : null,
    quantity: fetchedFor === token ? quantity : null,
  };
}
