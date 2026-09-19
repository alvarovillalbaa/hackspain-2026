"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { AmortizeContext } from "@/lib/xray/types";

export function useAmortizeContext(companyId: string | undefined) {
  const [data, setData] = useState<AmortizeContext | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    provider
      .getAmortizeContext(companyId)
      .then((ctx) => {
        if (cancelled) return;
        setData(ctx);
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
