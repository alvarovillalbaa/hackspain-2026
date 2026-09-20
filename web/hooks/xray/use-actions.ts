"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { onDataImported } from "@/lib/xray/import-events";
import { hasPendingCopy } from "@/lib/xray/recommend-actions";
import type { ActionRecommendation } from "@/lib/xray/types";

/**
 * The route answers with deterministic actions at once and lets Eve write
 * copy in the background (≤ 45 s). While any action still lacks that copy,
 * refetch on this schedule; ids, order and amounts never change between
 * fetches, only title/description/reasoning do, so the list stays put.
 */
export const ENRICHMENT_REFRESH_MS = [4_000, 6_000, 8_000, 10_000, 12_000, 15_000];

export function useActions(companyId: string | undefined) {
  const [data, setData] = useState<ActionRecommendation[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return onDataImported((ids) => {
      if (!companyId) return;
      if (ids.length === 0 || ids.includes(companyId)) setTick((t) => t + 1);
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFetchedFor(null);

    const load = (attempt: number) => {
      provider
        .listActions(companyId)
        .then((a) => {
          if (cancelled) return;
          setData(a);
          setError(null);
          setFetchedFor(`${companyId}:${tick}`);
          const delay = ENRICHMENT_REFRESH_MS[attempt];
          if (hasPendingCopy(a) && delay != null) {
            timer = setTimeout(() => load(attempt + 1), delay);
          }
        })
        .catch((e) => {
          if (cancelled) return;
          if (attempt === 0) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setFetchedFor(`${companyId}:${tick}`);
          }
          // A failed refresh keeps whatever list is already on screen.
        });
    };
    load(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [companyId, tick]);

  if (!companyId) {
    return { data: [] as ActionRecommendation[], loading: false, error: null };
  }

  const token = `${companyId}:${tick}`;
  return {
    data: fetchedFor === token ? data : [],
    loading: fetchedFor !== token,
    error: fetchedFor === token ? error : null,
  };
}
