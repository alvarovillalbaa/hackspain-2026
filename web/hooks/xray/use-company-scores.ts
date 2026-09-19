"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { ScoreSnapshot } from "@/lib/xray/types";

export function useCompanyScores(ids: string[]) {
  const key = ids.join(",");
  const [data, setData] = useState<ScoreSnapshot[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) {
      setData([]);
      setError(null);
      setFetchedFor(key);
      return;
    }
    let cancelled = false;
    setFetchedFor(null);
    Promise.allSettled(ids.map((id) => provider.getScore(id))).then((settled) => {
      if (cancelled) return;
      const rows = settled.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : []
      );
      setData(rows);
      const firstFail = settled.find((r) => r.status === "rejected");
      setError(
        rows.length === 0 && firstFail && firstFail.status === "rejected"
          ? firstFail.reason instanceof Error
            ? firstFail.reason
            : new Error(String(firstFail.reason))
          : null
      );
      setFetchedFor(key);
    });
    return () => {
      cancelled = true;
    };
    // ids is represented by key; callers pass a stable parsed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    data: fetchedFor === key ? data : [],
    loading: fetchedFor !== key,
    error: fetchedFor === key ? error : null,
  };
}
