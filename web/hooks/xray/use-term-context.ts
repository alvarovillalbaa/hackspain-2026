"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { onDataImported } from "@/lib/xray/import-events";
import type { TermContext } from "@/lib/xray/types";

export function useTermContext(companyId: string | undefined) {
  const [data, setData] = useState<TermContext | null>(null);
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
    const get =
      provider.getTermContext?.bind(provider) ??
      (async () => null as TermContext | null);
    get(companyId)
      .then((ctx) => {
        if (cancelled) return;
        setData(ctx);
        setError(null);
        setFetchedFor(`${companyId}:${tick}`);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(`${companyId}:${tick}`);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, tick]);

  if (!companyId) {
    return { data: null, loading: false, error: null };
  }

  const token = `${companyId}:${tick}`;
  return {
    data: fetchedFor === token ? data : null,
    loading: fetchedFor !== token,
    error: fetchedFor === token ? error : null,
  };
}
