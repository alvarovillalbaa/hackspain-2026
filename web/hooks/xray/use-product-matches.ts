"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
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

  useEffect(() => {
    if (!companyId || !actionId || !key) return;
    let cancelled = false;
    setPhase("queued");

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
        setFetchedFor(key);
        setPhase((prev) => (prev === "done" ? prev : "done"));
        es.close();
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(key);
        setPhase("fallback");
        es.close();
      });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [companyId, actionId, amount, key]);

  if (!key) {
    return {
      data: [] as ProductMatch[],
      loading: false,
      error: null,
      phase: "idle" as RecommendPhase,
    };
  }

  return {
    data: fetchedFor === key ? data : [],
    loading: fetchedFor !== key,
    error: fetchedFor === key ? error : null,
    phase: fetchedFor === key ? phase : ("queued" as RecommendPhase),
  };
}
