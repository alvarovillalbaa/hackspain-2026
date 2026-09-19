"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { ActionRecommendation } from "@/lib/xray/types";

export function useActions(companyId: string | undefined) {
  const [data, setData] = useState<ActionRecommendation[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    provider
      .listActions(companyId)
      .then((a) => {
        if (cancelled) return;
        setData(a);
        setError(null);
        setFetchedFor(companyId);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(companyId);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!companyId) {
    return { data: [] as ActionRecommendation[], loading: false, error: null };
  }

  return {
    data: fetchedFor === companyId ? data : [],
    loading: fetchedFor !== companyId,
    error: fetchedFor === companyId ? error : null,
  };
}
