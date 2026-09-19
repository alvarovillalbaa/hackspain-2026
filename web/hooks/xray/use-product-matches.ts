"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { ProductMatch } from "@/lib/xray/types";

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

  useEffect(() => {
    if (!companyId || !actionId || !key) return;
    let cancelled = false;
    provider
      .listProducts(companyId, actionId, amount)
      .then((p) => {
        if (cancelled) return;
        setData(p);
        setError(null);
        setFetchedFor(key);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, actionId, amount, key]);

  if (!key) {
    return { data: [] as ProductMatch[], loading: false, error: null };
  }

  return {
    data: fetchedFor === key ? data : [],
    loading: fetchedFor !== key,
    error: fetchedFor === key ? error : null,
  };
}
