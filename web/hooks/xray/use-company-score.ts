"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { ScoreSnapshot } from "@/lib/xray/types";

export function useCompanyScore(companyId: string | undefined) {
  const [data, setData] = useState<ScoreSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    provider
      .getScore(companyId)
      .then((s) => {
        if (cancelled) return;
        setData(s);
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
    return { data: null, loading: false, error: null };
  }

  return {
    data: fetchedFor === companyId ? data : null,
    loading: fetchedFor !== companyId,
    error: fetchedFor === companyId ? error : null,
  };
}
