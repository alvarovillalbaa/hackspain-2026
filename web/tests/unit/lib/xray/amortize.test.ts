import { describe, expect, it } from "vitest";
import {
  allocateAmortization,
  amortizeAmountBounds,
  sortContractsForAmortize,
  withCashWarning,
} from "@/lib/xray/amortize";
import type { AmortizeContract, AmortizeContext } from "@/lib/xray/types";

const contracts: AmortizeContract[] = [
  {
    product_id: "D1",
    bank_name: "BBVA",
    type: "loan",
    outstanding: 100_000,
    annual_rate: 0.05,
    amortization_type: "constant quote",
  },
  {
    product_id: "D2",
    bank_name: "Santander",
    type: "loan",
    outstanding: 80_000,
    annual_rate: 0.08,
    amortization_type: "constant quote",
  },
  {
    product_id: "D3",
    bank_name: "Sabadell",
    type: "loan",
    outstanding: 50_000,
    annual_rate: 0.08,
    amortization_type: null,
  },
];

describe("sortContractsForAmortize", () => {
  it("orders by rate desc then outstanding desc", () => {
    const ordered = sortContractsForAmortize(contracts);
    expect(ordered.map((c) => c.product_id)).toEqual(["D2", "D3", "D1"]);
  });
});

describe("allocateAmortization", () => {
  it("fills highest-rate contracts first", () => {
    const plan = allocateAmortization(contracts, 100_000);
    expect(plan.rows[0]!.product_id).toBe("D2");
    expect(plan.rows[0]!.allocated).toBe(80_000);
    expect(plan.rows[1]!.product_id).toBe("D3");
    expect(plan.rows[1]!.allocated).toBe(20_000);
    expect(plan.rows[2]!.allocated).toBe(0);
    expect(plan.total_allocated).toBe(100_000);
  });

  it("caps allocation at outstanding", () => {
    const plan = allocateAmortization(contracts, 1_000_000);
    expect(plan.total_allocated).toBe(230_000);
    expect(plan.exceeds_debt).toBe(true);
    for (const row of plan.rows) {
      expect(row.allocated).toBeLessThanOrEqual(row.outstanding);
      expect(row.remaining).toBe(row.outstanding - row.allocated);
    }
  });

  it("computes interest saved as allocated × rate", () => {
    const plan = allocateAmortization(contracts, 80_000);
    const d2 = plan.rows.find((r) => r.product_id === "D2")!;
    expect(d2.interest_saved_annual).toBe(6400);
    expect(plan.total_interest_saved_annual).toBe(6400);
  });

  it("handles zero / empty", () => {
    expect(allocateAmortization(contracts, 0).total_allocated).toBe(0);
    expect(allocateAmortization([], 50_000).total_allocated).toBe(0);
  });
});

describe("withCashWarning", () => {
  it("flags when amount exceeds cash", () => {
    const plan = allocateAmortization(contracts, 50_000);
    expect(withCashWarning(plan, 50_000, 40_000).exceeds_cash).toBe(true);
    expect(withCashWarning(plan, 50_000, 60_000).exceeds_cash).toBe(false);
    expect(withCashWarning(plan, 50_000, null).exceeds_cash).toBe(false);
  });
});

describe("amortizeAmountBounds", () => {
  it("caps at min(cash, debt, recommended×1.5)", () => {
    const ctx: AmortizeContext = {
      company_id: "C1",
      cash_balance: 90_000,
      contracts,
    };
    const { min, max } = amortizeAmountBounds(ctx, 100_000);
    expect(min).toBe(0);
    expect(max).toBe(90_000);
  });

  it("falls back when cash/debt missing", () => {
    const { max } = amortizeAmountBounds(null, 100_000);
    expect(max).toBe(150_000);
  });
});
