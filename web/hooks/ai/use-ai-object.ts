"use client";

import { useEffect, useState } from "react";

type AiObjectState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
};

/**
 * Thin client hook for feature routes that return JSON objects from AI SDK
 * helpers. Never invents a success payload — on HTTP failure, `error` is set
 * and `data` stays null (callers may keep a grounded source string separately).
 */
export function useAiObject<T>(input: {
  url: string | null;
  body?: Record<string, unknown>;
  enabled?: boolean;
}): AiObjectState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const enabled = input.enabled !== false && Boolean(input.url);
  const bodyKey = input.body ? JSON.stringify(input.body) : "";

  useEffect(() => {
    if (!enabled || !input.url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bodyKey || undefined,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as T & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setData(null);
          setError(new Error(json.error ?? `HTTP ${res.status}`));
          setLoading(false);
          return;
        }
        setData(json);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bodyKey serializes body
  }, [input.url, bodyKey, enabled]);

  return { data, error, loading };
}
