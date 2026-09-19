"use client";

import { useEffect, useState } from "react";

/** Blob session group — rehearsal focus, not a filter on `/` or `/companies`. */
export function useDemoSession() {
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/xray/session", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { group_id?: string };
        if (!cancelled && json.group_id) setGroupId(json.group_id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return groupId;
}
