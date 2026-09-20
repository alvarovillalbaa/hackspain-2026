import { describe, expect, it } from "vitest";
import {
  beginMarketplaceProgress,
  emitMarketplaceProgress,
  subscribeMarketplaceProgress,
} from "@/lib/xray/marketplace-progress";

describe("marketplace progress bus", () => {
  it("replays buffered events to late subscribers", () => {
    const key = "COMP_0001:act";
    beginMarketplaceProgress(key);
    emitMarketplaceProgress(key, { phase: "quantity" });
    const seen: string[] = [];
    const stop = subscribeMarketplaceProgress(key, (e) => seen.push(e.phase));
    emitMarketplaceProgress(key, { phase: "offering" });
    stop();
    expect(seen).toEqual(["quantity", "offering"]);
  });

  it("does not throw when a subscriber is already closed", () => {
    const key = "COMP_0001:dead";
    beginMarketplaceProgress(key);
    subscribeMarketplaceProgress(key, () => {
      throw new Error("Controller is already closed");
    });
    expect(() =>
      emitMarketplaceProgress(key, { phase: "fallback" })
    ).not.toThrow();
  });
});
