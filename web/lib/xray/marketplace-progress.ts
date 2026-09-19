/**
 * Process-local progress bus for the quantity → offering → match pipeline.
 * POST /api/xray/recommend emits; GET /api/xray/recommend/stream replays + follows.
 */

export const MARKETPLACE_PHASES = [
  "idle",
  "queued",
  "quantity",
  "offering",
  "match",
  "done",
  "fallback",
] as const;

export type MarketplacePhase = (typeof MARKETPLACE_PHASES)[number];

export type MarketplaceProgressEvent = {
  phase: MarketplacePhase;
  detail?: string;
};

type Listener = (event: MarketplaceProgressEvent) => void;

const buffers = new Map<string, MarketplaceProgressEvent[]>();
const listeners = new Map<string, Set<Listener>>();

export function marketplaceProgressKey(
  companyId: string,
  actionId: string
): string {
  return `${companyId}:${actionId}`;
}

export function emitMarketplaceProgress(
  key: string,
  event: MarketplaceProgressEvent
): void {
  const buf = buffers.get(key) ?? [];
  buf.push(event);
  buffers.set(key, buf);
  for (const listener of [...(listeners.get(key) ?? [])]) {
    try {
      listener(event);
    } catch {
      /* dead SSE / closed controller must not fail POST /recommend */
    }
  }
}

export function subscribeMarketplaceProgress(
  key: string,
  listener: Listener
): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  for (const event of buffers.get(key) ?? []) listener(event);
  return () => {
    const current = listeners.get(key);
    current?.delete(listener);
    if (current && current.size === 0) listeners.delete(key);
  };
}

export function beginMarketplaceProgress(key: string): void {
  buffers.set(key, []);
}

export function clearMarketplaceProgress(key: string): void {
  buffers.delete(key);
}
