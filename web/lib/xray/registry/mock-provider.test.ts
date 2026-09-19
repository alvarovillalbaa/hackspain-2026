import { describe, expect, it } from "vitest";
import { mockProvider } from "./mock-provider";

describe("mockProvider smoke", () => {
  it("lists companies and returns a score contract", async () => {
    const companies = await mockProvider.listCompanies();
    expect(companies.length).toBeGreaterThan(0);
    const score = await mockProvider.getScore(companies[0]!.company_id);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.dimensions).toBeDefined();
    expect(score.history.length).toBeGreaterThan(0);
  });

  it("returns products sorted by match for an action", async () => {
    const companies = await mockProvider.listCompanies();
    const id = companies[0]!.company_id;
    const actions = await mockProvider.listActions(id);
    expect(actions.length).toBeGreaterThan(0);
    const products = await mockProvider.listProducts(id, actions[0]!.id);
    expect(products.length).toBeGreaterThan(0);
    for (let i = 1; i < products.length; i++) {
      expect(products[i - 1]!.breakdown.match).toBeGreaterThanOrEqual(
        products[i]!.breakdown.match
      );
    }
  });
});
