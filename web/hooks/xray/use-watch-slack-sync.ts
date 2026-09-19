"use client";

import { useEffect } from "react";

/** Once per tab: if Slack is connected, push unsent watch hits. */
export function useWatchSlackSync() {
  useEffect(() => {
    const key = "xray.watch.flushed";
    if (sessionStorage.getItem(key)) return;
    let cancelled = false;
    fetch("/api/xray/watch/notify", { method: "POST" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) sessionStorage.setItem(key, "1");
      })
      .catch(() => {
        /* next navigation retries */
      });
    return () => {
      cancelled = true;
    };
  }, []);
}
