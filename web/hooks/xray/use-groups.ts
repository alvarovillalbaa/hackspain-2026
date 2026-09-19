"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { onDataImported } from "@/lib/xray/import-events";
import type { GroupSummary } from "@/lib/xray/group-summary";

export function useGroups() {
  const [data, setData] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return onDataImported(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .listGroups()
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
  }, [tick]);

  return { data, loading, error };
}
