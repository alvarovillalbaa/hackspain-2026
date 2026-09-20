"use client";

import { useEffect, useState } from "react";

/** Blob session group selected from `/start`. `undefined` means it is loading. */
export function useDemoSession() {
  const [groupId, setGroupId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/xray/session", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`session HTTP ${res.status}`);
        const json = (await res.json()) as { group_id?: string };
        if (!cancelled) setGroupId(json.group_id ?? null);
      })
      .catch(() => {
        if (!cancelled) setGroupId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return groupId;
}
