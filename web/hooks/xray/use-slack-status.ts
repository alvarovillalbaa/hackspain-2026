"use client";

import { useCallback, useEffect, useState } from "react";
import type { SlackStatus } from "@/lib/xray/slack-status";

export function useSlackStatus() {
  const [status, setStatus] = useState<SlackStatus>({
    connected: false,
    source: null,
  });
  const [fetched, setFetched] = useState(false);

  const refresh = useCallback(() => {
    return fetch("/api/xray/settings/slack", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SlackStatus>;
      })
      .then((row) => {
        setStatus(row);
        setFetched(true);
        return row;
      })
      .catch(() => {
        setStatus({ connected: false, source: null });
        setFetched(true);
        return { connected: false, source: null } as SlackStatus;
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status: fetched ? status : { connected: false, source: null }, loading: !fetched, refresh };
}
