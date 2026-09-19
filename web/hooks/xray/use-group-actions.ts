"use client";

import { useEffect, useState } from "react";
import { provider } from "@/lib/xray/provider";
import { onDataImported } from "@/lib/xray/import-events";
import type { ActionRecommendation } from "@/lib/xray/types";

export interface GroupAction extends ActionRecommendation {
  company_id: string;
  company_name: string;
}

const MAX_ACTIONS = 5;

export function rankGroupActions(rows: GroupAction[]): GroupAction[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.uplift - a.uplift ||
        a.company_id.localeCompare(b.company_id) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, MAX_ACTIONS);
}

function parseMembers(
  key: string
): { company_id: string; name: string }[] {
  if (!key) return [];
  return key.split("|").map((row) => {
    const i = row.indexOf(":");
    return { company_id: row.slice(0, i), name: row.slice(i + 1) };
  });
}

export function useGroupActions(
  members: { company_id: string; name: string }[]
) {
  const key = members
    .map((m) => `${m.company_id}:${m.name}`)
    .sort()
    .join("|");
  const [data, setData] = useState<GroupAction[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ids = parseMembers(key).map((m) => m.company_id);
    return onDataImported((imported) => {
      if (ids.length === 0) return;
      if (imported.length === 0 || imported.some((id) => ids.includes(id))) {
        setTick((t) => t + 1);
      }
    });
  }, [key]);

  useEffect(() => {
    const parsed = parseMembers(key);
    if (parsed.length === 0) return;
    let cancelled = false;
    setFetchedFor(null);
    Promise.all(
      parsed.map((member) =>
        provider.listActions(member.company_id).then((actions) =>
          actions.map((action) => ({
            ...action,
            company_id: member.company_id,
            company_name: member.name,
          }))
        )
      )
    )
      .then((lists) => {
        if (cancelled) return;
        setData(rankGroupActions(lists.flat()));
        setError(null);
        setFetchedFor(`${key}:${tick}`);
      })
      .catch((e) => {
        if (cancelled) return;
        setData([]);
        setError(e instanceof Error ? e : new Error(String(e)));
        setFetchedFor(`${key}:${tick}`);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  if (!key) {
    return { data: [] as GroupAction[], loading: false, error: null };
  }

  const token = `${key}:${tick}`;
  return {
    data: fetchedFor === token ? data : [],
    loading: fetchedFor !== token,
    error: fetchedFor === token ? error : null,
  };
}
