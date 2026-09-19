"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { CompanySummary } from "@/lib/xray/company-summary";

export function useCompanySummaries() {
  const [data, setData] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider
      .listCompanySummaries()
      .then((list) => {
        if (cancelled) return;
        setData(list);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
