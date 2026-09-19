import { describe, expect, it, beforeEach } from "vitest";
import {
  clearStoreMemoryForTests,
  deleteDeal,
  deleteDealsForCompanies,
  readActions,
  readDeal,
  readSession,
  writeActions,
  writeDeal,
  writeSession,
} from "./store";
import { DEFAULT_GROUP_ID } from "./demo";
import type { AcceptedDeal, ActionRecommendation } from "./types";

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

describe("store (memory path)", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
  });

  it("defaults session to GROUP_0147", async () => {
    const s = await readSession();
    expect(s.group_id).toBe(DEFAULT_GROUP_ID);
  });

  it("writes and reads session", async () => {
    await writeSession("GROUP_0001");
    expect((await readSession()).group_id).toBe("GROUP_0001");
  });

  it("saves and reads a deal by company", async () => {
    await writeDeal(deal());
    expect((await readDeal("COMP_0001"))?.product_id).toBe("PROD_1");
    expect(await readDeal("COMP_9999")).toBeNull();
  });

  it("overwrites the previous deal for the same company", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ product_id: "PROD_2", uplift: 8 }));
    const d = await readDeal("COMP_0001");
    expect(d?.product_id).toBe("PROD_2");
    expect(d?.uplift).toBe(8);
  });

  it("clears one company deal", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ company_id: "COMP_0002" }));
    await deleteDeal("COMP_0001");
    expect(await readDeal("COMP_0001")).toBeNull();
    expect(await readDeal("COMP_0002")).not.toBeNull();
  });

  it("clears deals for re-imported companies", async () => {
    await writeDeal(deal());
    await writeDeal(deal({ company_id: "COMP_0002" }));
    await deleteDealsForCompanies(["COMP_0001"]);
    expect(await readDeal("COMP_0001")).toBeNull();
    expect(await readDeal("COMP_0002")).not.toBeNull();
  });

  it("persists Eve ficha actions in memory", async () => {
    const actions: ActionRecommendation[] = [
      {
        id: "COMP_0001-amortize-0",
        kind: "amortize",
        title: "Amortizar",
        rationale: "Caja ociosa",
        recommended_amount: 50_000,
        dimension_deltas: { debt: 0.1 },
        uplift: 3,
        origin: "deterministic",
      },
    ];
    await writeActions("COMP_0001", actions);
    expect(await readActions("COMP_0001")).toEqual(actions);
    expect(await readActions("COMP_9999")).toBeNull();
  });
});
