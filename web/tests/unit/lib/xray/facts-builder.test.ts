/**
 * Smoke test for facts-builder (import path).
 */
import { describe, expect, it } from "vitest";
import {
  applyMapping,
  buildFactsFromTables,
  parseCsvText,
  rewriteCompanyIds,
  rowsToCsv,
} from "@/lib/xray/facts-builder";

describe("facts-builder", () => {
  it("parses CSV and builds cash series", () => {
    const text = [
      "transaction_id,company_id,product_id,date,amount,category,status",
      "t1,A,CHK,2026-07-15,100,collection,booked",
      "t2,A,CHK,2026-08-01,-40,supplier,booked",
    ].join("\n");
    const rows = parseCsvText(text);
    expect(rows).toHaveLength(2);

    const facts = buildFactsFromTables(
      {
        transactions: rows,
        balances: [
          {
            product_id: "CHK",
            company_id: "A",
            date: "2026-09-01",
            balance: "200",
          },
        ],
        banking_products: [
          { product_id: "CHK", company_id: "A", type: "checking", bank_name: "BBVA" },
        ],
      },
      ["A"]
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]!.company_id).toBe("A");
    expect(facts[0]!.cash_balance).toBe(200);
    expect(facts[0]!.incumbent_banks).toContain("BBVA");
    expect(facts[0]!.cash_series.some((m) => m.month === "2026-08")).toBe(true);
  });

  it("applies column mapping", () => {
    const rows = applyMapping(
      [{ id: "1", importe: "10", company_id: "A" }],
      { id: "transaction_id", importe: "amount", company_id: "company_id" }
    );
    expect(rows[0]).toEqual({
      transaction_id: "1",
      amount: "10",
      company_id: "A",
    });
  });

  it("rewrites company_id and round-trips CSV", () => {
    const rows = rewriteCompanyIds(
      [
        { company_id: "A", amount: "10" },
        { company_id: "B", amount: "2,5", note: "x" },
      ],
      "COMP_0001"
    );
    expect(rows.every((r) => r.company_id === "COMP_0001")).toBe(true);
    const csv = rowsToCsv(rows);
    expect(csv).toContain("company_id,amount,note");
    expect(csv).toContain('"2,5"');
    const parsed = parseCsvText(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.company_id).toBe("COMP_0001");
  });
});
