import { describe, expect, it } from "vitest";
import { buildBookProducts } from "@/lib/xray/book-products";
import type { AcceptedDeal } from "@/lib/xray/types";

describe("buildBookProducts", () => {
  it("includes outstanding contracts and tags deals as Contratado", () => {
    const deal: AcceptedDeal = {
      company_id: "COMP_1",
      action_id: "a1",
      product_id: "PROD_X",
      label: "Préstamo",
      issuer_name: "BBVA",
      amount: 200_000,
      projected_score: 55,
      projected_band: "BBB",
      uplift: 3,
      accepted_at: "2026-09-19T00:00:00.000Z",
    };
    const rows = buildBookProducts(
      [
        {
          company_id: "COMP_1",
          company_name: "Acme",
          currency: "EUR",
          contracts: [
            {
              product_id: "LOAN_1",
              type: "loan",
              bank_name: "Santander",
              granted: 100_000,
              outstanding: 80_000,
              annual_rate: 0.055,
              amortization_type: "french",
              total_periods: 24,
              interest_type: "fixed",
            },
            {
              product_id: "LOAN_0",
              type: "loan",
              bank_name: "Empty",
              granted: 0,
              outstanding: 0,
              annual_rate: 0.01,
              amortization_type: null,
              total_periods: null,
              interest_type: null,
            },
          ],
        },
      ],
      [deal]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe("deal");
    expect(rows[0].type_label).toBe("Contratado");
    expect(rows[0].outstanding).toBe(200_000);
    expect(rows[1].entity_name).toBe("Santander");
    expect(rows[1].residual_periods).toBe(24);
  });
});
