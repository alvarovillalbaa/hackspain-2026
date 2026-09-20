import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/xray/recommend/stream/route";
import { beginMarketplaceProgress, emitMarketplaceProgress, marketplaceProgressKey } from "@/lib/xray/marketplace-progress";

describe("marketplace progress replay", () => {
  it.each(["done", "fallback"] as const)("closes safely when %s was already buffered", async (phase) => {
    const key = marketplaceProgressKey("COMP_STREAM", phase);
    beginMarketplaceProgress(key);
    emitMarketplaceProgress(key, { phase });
    const response = await GET(new Request(`http://localhost/api/xray/recommend/stream?company_id=COMP_STREAM&action_id=${phase}`));
    const text = await response.text();
    expect(text).toContain(`"phase":"${phase}"`);
    expect(() => emitMarketplaceProgress(key, { phase: "quantity" })).not.toThrow();
  });
});
