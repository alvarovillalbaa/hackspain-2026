import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDeal,
  clearDealsForCompanies,
  fetchDeal,
  saveDeal,
} from "@/lib/xray/deals";
import type { AcceptedDeal } from "@/lib/xray/types";

const deal: AcceptedDeal = {
  company_id: "COMP_0001",
  action_id: "a1",
  product_id: "p1",
  label: "Préstamo",
  issuer_name: "Banco",
  amount: 100_000,
  projected_score: 60,
  projected_band: "BB",
  uplift: 4,
  accepted_at: "2026-09-20T00:00:00.000Z",
};

describe("deals client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  it("fetchDeal returns null on error and the deal on ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("nope", { status: 404 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ deal }), { status: 200 })
        )
    );
    expect(await fetchDeal("COMP_0001")).toBeNull();
    expect(await fetchDeal("COMP_0001")).toEqual(deal);
  });

  it("saveDeal / clearDeal report ok boolean", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
        .mockResolvedValueOnce(new Response("{}", { status: 500 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    );
    expect(await saveDeal(deal)).toBe(true);
    expect(await saveDeal(deal)).toBe(false);
    expect(await clearDeal("COMP_0001")).toBe(true);
  });

  it("clearDealsForCompanies fans out deletes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await clearDealsForCompanies(["A", "B"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses relative URLs when window is defined (jsdom)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ deal: null }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    await fetchDeal("X");
    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/xray/deals/X");
  });
});
