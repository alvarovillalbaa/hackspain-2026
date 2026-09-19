import type { HistoryPoint } from "./types";

export const MAX_COMPARE = 3;

export const COMPARE_COLORS = [
  "var(--foreground)",
  "var(--destructive)",
  "var(--chart-2)",
] as const;

export function parseCompareIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function compareHref(ids: string[]): string {
  return `/compare?ids=${parseCompareIds(ids.join(","))
    .map(encodeURIComponent)
    .join(",")}`;
}

export function alignHistories(
  series: { key: string; history: HistoryPoint[] }[]
): Array<Record<string, string | number | undefined>> {
  const months = [
    ...new Set(series.flatMap((s) => s.history.map((h) => h.month))),
  ].sort();
  return months.map((month) => {
    const row: Record<string, string | number | undefined> = { month };
    for (const s of series) {
      row[s.key] = s.history.find((h) => h.month === month)?.score;
    }
    return row;
  });
}
