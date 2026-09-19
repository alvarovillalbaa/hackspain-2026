"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { PeerCohort } from "@/lib/xray/peers";

export function usePeers(companyId: string | undefined, k?: number) {
  const [data, setData] = useState<PeerCohort | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    provider
      .getPeers(companyId, k)
      .then((p) => {
        if (cancelled) return;
        setData(p);
        setError(null);
        setFetchedFor(companyId);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(companyId);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, k]);

  if (!companyId) {
    return { data: null, loading: false, error: null };
  }

  return {
    data: fetchedFor === companyId ? data : null,
    loading: fetchedFor !== companyId,
    error: fetchedFor === companyId ? error : null,
  };
}
