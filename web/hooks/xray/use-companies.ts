"use client";

import { useCallback, useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { emitDataImported } from "@/lib/xray/import-events";
import type { CompanyRef } from "@/lib/xray/types";

export function useCompanies() {
  const [data, setData] = useState<CompanyRef[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .listCompanies()
      .then((list) => {
        if (cancelled) return;
        setData(list);
        setGroupId(list[0]?.group_id ?? null);
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

  const addImported = useCallback((companies: CompanyRef[]) => {
    setData((prev) => {
      const map = new Map(prev.map((c) => [c.company_id, c]));
      for (const c of companies) {
        const prevRow = map.get(c.company_id);
        map.set(c.company_id, { ...prevRow, ...c, imported: true });
      }
      return [...map.values()];
    });
    emitDataImported(companies.map((c) => c.company_id));
  }, []);

  return { data, groupId, loading, error, refresh, addImported };
}
