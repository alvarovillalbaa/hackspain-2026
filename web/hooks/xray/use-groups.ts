"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { GroupSummary } from "@/lib/xray/group-summary";

export function useGroups() {
  const [data, setData] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  return { data, loading, error };
}
