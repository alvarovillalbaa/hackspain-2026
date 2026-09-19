"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { MethodMetrics } from "@/lib/xray/types";

export function useMethodMetrics() {
  const [data, setData] = useState<MethodMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    provider
      .getMethodMetrics()
      .then((m) => {
        if (cancelled) return;
        setData(m);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
