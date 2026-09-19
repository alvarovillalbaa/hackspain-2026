"use client";

import { useCallback, useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { emitDataImported } from "@/lib/xray/import-events";
import type { CompanyRef } from "@/lib/xray/types";

const STORAGE_KEY = "xray.imported.v0";

function loadImported(): CompanyRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompanyRef[]) : [];
  } catch {
    return [];
  }
}

function saveImported(companies: CompanyRef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(companies));
}

export function useCompanies() {
  const [data, setData] = useState<CompanyRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    provider
      .listCompanies()
      .then((list) => {
        if (cancelled) return;
        const imported = loadImported();
        const ids = new Set(list.map((c) => c.company_id));
        const merged = [
          ...list,
          ...imported.filter((c) => !ids.has(c.company_id)),
        ];
        setData(merged);
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
    const existing = loadImported();
    const byId = new Map(existing.map((c) => [c.company_id, c]));
    for (const c of companies) byId.set(c.company_id, { ...c, imported: true });
    const next = [...byId.values()];
    saveImported(next);
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

  return { data, loading, error, refresh, addImported };
}
