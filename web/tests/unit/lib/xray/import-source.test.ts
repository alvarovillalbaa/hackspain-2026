import { describe, expect, it } from "vitest";
import {
  applyDealToTables,
  DEAL_TX_DATE,
  ensureCompanyRow,
  filterTablesForCompany,
  parseDealActionKind,
  tablesToIngestFiles,
} from "@/lib/xray/import-source";
import { parseCsvText, type Tables } from "@/lib/xray/facts-builder";
import type { AcceptedDeal } from "@/lib/xray/types";

const tables: Tables = {
  groups: [{ group_id: "G1", erp: "x" }],
  companies: [
    { company_id: "A", group_id: "G1", currency: "EUR" },
    { company_id: "B", group_id: "G1", currency: "EUR" },
  ],
  banking_products: [
    { product_id: "CHK", company_id: "A", type: "checking", bank_name: "BBVA" },
    { product_id: "CHK_B", company_id: "B", type: "checking", bank_name: "Sabadell" },
  ],
  transactions: [
    {
      transaction_id: "t1",
      company_id: "A",
      product_id: "CHK",
      date: "2026-07-15",
      amount: "100",
      status: "booked",
    },
    {
      transaction_id: "t2",
      company_id: "B",
      product_id: "CHK_B",
      date: "2026-07-15",
      amount: "50",
      status: "booked",
    },
  ],
  balances: [
    { product_id: "CHK", company_id: "A", date: "2026-09-01", balance: "200" },
    { product_id: "CHK_B", company_id: "B", date: "2026-09-01", balance: "80" },
  ],
  debt_products: [
    {
      product_id: "LOAN1",
      company_id: "A",
      type: "loan",
      outstanding: "50000",
      granted: "50000",
      bank_name: "BBVA",
    },
  ],
  debt_schedule_config: [
    {
      product_id: "LOAN1",
      company_id: "A",
      outstanding_balance: "50000",
      granted_balance: "50000",
    },
  ],
};

const deal: AcceptedDeal = {
  company_id: "A",
  action_id: "A-new_debt-0",
  product_id: "PROD_1",
  label: "Préstamo",
  issuer_name: "Banco Demo",
  amount: 10_000,
  projected_score: 60,
  projected_band: "BB",
  uplift: 4,
  accepted_at: "2026-09-19T12:00:00.000Z",
};

describe("filterTablesForCompany", () => {
  it("drops other companies and keeps the group", () => {
    const sliced = filterTablesForCompany(tables, "A");
    expect(sliced.companies).toHaveLength(1);
    expect(sliced.transactions).toHaveLength(1);
    expect(sliced.transactions![0]!.company_id).toBe("A");
    expect(sliced.groups![0]!.group_id).toBe("G1");
    expect(sliced.balances).toHaveLength(1);
  });
});

describe("applyDealToTables", () => {
  it("adds disbursement tx, loan rows, and bumps checking cash for new_debt", () => {
    const next = applyDealToTables(tables, deal, "new_debt");
    const tx = next.transactions!.find((r) => r.transaction_id === "DEAL_TX_PROD_1");
    expect(tx?.amount).toBe("10000");
    expect(tx?.date).toBe(DEAL_TX_DATE);
    expect(tx?.product_id).toBe("CHK");
    expect(next.balances![0]!.balance).toBe("10200");
    expect(
      next.debt_products!.some((r) => r.product_id === "deal-PROD_1")
    ).toBe(true);
    expect(
      next.debt_schedule_config!.some(
        (r) => r.product_id === "deal-PROD_1" && r.outstanding_balance === "10000"
      )
    ).toBe(true);
    expect(tables.balances![0]!.balance).toBe("200");
  });

  it("pays down outstanding and cash for amortize", () => {
    const next = applyDealToTables(
      tables,
      { ...deal, amount: 5 },
      "amortize"
    );
    expect(next.balances![0]!.balance).toBe("195");
    expect(next.debt_schedule_config![0]!.outstanding_balance).toBe("49995");
    expect(next.debt_products![0]!.outstanding).toBe("49995");
    const tx = next.transactions!.find((r) => r.transaction_id === "DEAL_TX_PROD_1");
    expect(tx?.amount).toBe("-5");
  });
});

describe("parseDealActionKind", () => {
  it("reads kind from action id", () => {
    expect(parseDealActionKind("A-new_debt-0", "A")).toBe("new_debt");
    expect(parseDealActionKind("A-amortize-1", "A")).toBe("amortize");
    expect(parseDealActionKind("nope", "A")).toBeNull();
  });
});

describe("ensureCompanyRow", () => {
  it("inserts a companies row when the slice has none", () => {
    const next = ensureCompanyRow(
      { transactions: [{ company_id: "A", amount: "1" }] },
      {
        company_id: "A",
        group_id: "G1",
        name: "Acme",
        country: "ES",
        currency: "EUR",
        n_companies_in_group: 1,
      }
    );
    expect(next.companies).toEqual([
      {
        company_id: "A",
        group_id: "G1",
        name: "Acme",
        country: "ES",
        currency: "EUR",
      },
    ]);
  });
});

describe("tablesToIngestFiles", () => {
  it("emits identity-mapped CSVs that parse back", () => {
    const sliced = filterTablesForCompany(tables, "A");
    const { files, mappings } = tablesToIngestFiles(sliced);
    expect(files.some((f) => f.kind === "transactions")).toBe(true);
    expect(mappings["transactions.csv"]?.mapping).toEqual({});
    const tx = files.find((f) => f.kind === "transactions")!;
    const rows = parseCsvText(tx.csv);
    expect(rows[0]!.company_id).toBe("A");
  });
});
