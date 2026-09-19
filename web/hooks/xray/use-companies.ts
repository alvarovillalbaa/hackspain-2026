"use client";

import { useCallback, useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
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
    const ids = new Set(existing.map((c) => c.company_id));
    const next = [
      ...existing,
      ...companies.filter((c) => !ids.has(c.company_id)),
    ];
    saveImported(next);
    setData((prev) => {
      const pids = new Set(prev.map((c) => c.company_id));
      return [...prev, ...companies.filter((c) => !pids.has(c.company_id))];
    });
  }, []);

  return { data, loading, error, refresh, addImported };
}
