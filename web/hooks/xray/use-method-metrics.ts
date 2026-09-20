"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { MethodMetrics } from "@/lib/xray/types";

export function useMethodMetrics() {
  const [data, setData] = useState<MethodMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    provider
      .getMethodMetrics()
      .then((m) => {
        if (cancelled) return;
        setData(m);
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
