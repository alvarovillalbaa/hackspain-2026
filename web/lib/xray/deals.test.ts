import { describe, expect, it, beforeEach } from "vitest";
import {
  clearDeal,
  clearDealsForCompanies,
  fetchDeal,
  saveDeal,
} from "./deals";
import {
  clearStoreMemoryForTests,
  deleteDealsForCompanies,
  readDeal,
  writeDeal,
} from "./store";
import type { AcceptedDeal } from "./types";

function deal(over: Partial<AcceptedDeal> = {}): AcceptedDeal {
  return {
    company_id: "COMP_0001",
    action_id: "COMP_0001-refinance-0",
    product_id: "PROD_1",
    label: "Préstamo",
    issuer_name: "Banco Demo",
    amount: 120_000,
    projected_score: 56,
    projected_band: "BB",
    uplift: 4,
    accepted_at: "2026-09-19T12:00:00.000Z",
    ...over,
  };
}

/**
 * Client helpers call /api/xray/deals — unit tests exercise the store memory
 * path (same as the API without BLOB_READ_WRITE_TOKEN).
 */
describe("deals (store memory)", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("round-trips via store", async () => {
    await writeDeal(deal());
    expect((await readDeal("COMP_0001"))?.product_id).toBe("PROD_1");
  });

  it("deleteDealsForCompanies clears selected ids", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ company_id: "COMP_0002" }));
    await deleteDealsForCompanies(["COMP_0001"]);
    expect(await readDeal("COMP_0001")).toBeNull();
    expect(await readDeal("COMP_0002")).not.toBeNull();
  });
});

describe("deals client exports", () => {
  it("exports async helpers", () => {
    expect(typeof fetchDeal).toBe("function");
    expect(typeof saveDeal).toBe("function");
    expect(typeof clearDeal).toBe("function");
    expect(typeof clearDealsForCompanies).toBe("function");
  });
});
