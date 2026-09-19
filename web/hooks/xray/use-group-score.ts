"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import type { GroupScore } from "@/lib/xray/group-score";

export function useGroupScore(groupId: string | undefined) {
  const [data, setData] = useState<GroupScore | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    provider
      .getGroupScore(groupId)
      .then((g) => {
        if (cancelled) return;
        setData(g);
        setError(null);
        setFetchedFor(groupId);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(groupId);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!groupId) {
    return { data: null, loading: false, error: null };
  }

  return {
    data: fetchedFor === groupId ? data : null,
    loading: fetchedFor !== groupId,
    error: fetchedFor === groupId ? error : null,
  };
}
