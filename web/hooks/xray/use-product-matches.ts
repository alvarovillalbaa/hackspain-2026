"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { onDataImported } from "@/lib/xray/import-events";
import type { ProductMatch } from "@/lib/xray/types";

export type RecommendPhase =
  | "idle"
  | "queued"
  | "quantity"
  | "offering"
  | "match"
  | "done"
  | "fallback";

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
    setFetchedFor(null);

    const es = new EventSource(
      `/api/xray/recommend/stream?company_id=${encodeURIComponent(companyId)}&action_id=${encodeURIComponent(actionId)}`
    );
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { phase?: RecommendPhase };
        if (msg.phase && !cancelled) setPhase(msg.phase);
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
    };

    provider
      .listProducts(companyId, actionId, amount)
      .then((p) => {
        if (cancelled) return;
        setData(p);
        setError(null);
        setFetchedFor(`${key}:${tick}`);
        setPhase((prev) => (prev === "done" ? prev : "done"));
        es.close();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(`${key}:${tick}`);
        setPhase("fallback");
        es.close();
      });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [companyId, actionId, amount, key, tick]);

  if (!key) {
    return {
      data: [] as ProductMatch[],
      loading: false,
      error: null,
      phase: "idle" as RecommendPhase,
    };
  }

  const token = `${key}:${tick}`;
  return {
    data: fetchedFor === token ? data : [],
    loading: fetchedFor !== token,
    error: fetchedFor === token ? error : null,
    phase: fetchedFor === token ? phase : ("queued" as RecommendPhase),
  };
}
