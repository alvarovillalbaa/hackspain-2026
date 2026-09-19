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

export function usePeerCohorts(ids: string[]) {
  const key = ids.join(",");
  const [data, setData] = useState<PeerCohort[]>([]);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setData([]);
      setFetchedFor(key);
      return;
    }
    let cancelled = false;
    setFetchedFor(null);
    Promise.allSettled(ids.map((id) => provider.getPeers(id))).then((settled) => {
      if (cancelled) return;
      setData(
        settled.flatMap((r) =>
          r.status === "fulfilled" && r.value ? [r.value] : []
        )
      );
      setFetchedFor(key);
    });
    return () => {
      cancelled = true;
    };
    // ids is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: fetchedFor === key ? data : [],
    loading: fetchedFor !== key,
  };
}
