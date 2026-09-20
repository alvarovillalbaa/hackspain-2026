import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreToBand } from "@/lib/xray/bands";
import type { CompanyFacts, ExportedScore } from "@/lib/xray/dataset/types";
import { DEAL_TX_DATE } from "@/lib/xray/import-source";
import { materializeDealPack } from "@/lib/xray/materialize-deal";
import { applyAction, publishedProjection } from "@/lib/xray/scoring";
import {
  clearStoreMemoryForTests,
  readImportedPack,
  readImportSource,
  writeImportedPack,
  writeImportSource,
} from "@/lib/xray/store";
import type { AcceptedDeal, ActionRecommendation, CompanyRef, ScoreSnapshot } from "@/lib/xray/types";

/**
 * Unit seam for deal materialization: published score shifts by radar uplift
 * and dimensions update via applyAction (same as materializeDealPack).
 */
describe("deal rescore seam", () => {
  const snap: ScoreSnapshot = {
    company_id: "COMP_0001",
    month: "2026-08",
    score: 55,
    band: "B",
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "high",
    sub_scores: {
      liquidity: 40,
      collections: 50,
      payments: 40,
      debt: 35,
      activity: 55,
    },
    n_signals: 4,
    n_red: 0,
    signals: {
      cash_buffer_days: 10,
      overdue_flow_rate_3m: 0.02,
      dscr_6m: 1.5,
      net_cash_flow_ratio_3m: 0.1,
    },
    dimensions: {
      liquidity: 0.4,
      collections: 0.5,
      payments: 0.4,
      debt: 0.35,
      activity: 0.55,
    },
    peer_percentile: 40,
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    history: [],
    drivers: [],
    alerts: [],
    explanation: null,
  };

  const action: ActionRecommendation = {
    id: "a1",
    kind: "refinance",
    title: "Refi",
    rationale: "Deuda cara.",
    recommended_amount: 100_000,
    dimension_deltas: { debt: 0.12, payments: 0.03 },
    uplift: 0,
    origin: "deterministic",
  };

  it("publishedProjection moves the official score by radar uplift", () => {
    const p = publishedProjection(snap, action, 100_000);
    expect(p.after).toBeGreaterThan(p.before);
    expect(p.toBand).toBe(scoreToBand(p.after));
  });

  it("applyAction updates dimensions", () => {
    const next = applyAction(snap, action, 100_000);
    expect(next.dimensions.debt).toBeGreaterThan(snap.dimensions.debt);
  });
});

const runtimeDir = mkdtempSync(join(tmpdir(), "xray-deal-"));
process.env.XRAY_RUNTIME_DIR = runtimeDir;

afterAll(() => {
  rmSync(runtimeDir, { recursive: true, force: true });
});

function exported(over: Partial<ExportedScore> = {}): ExportedScore {
  return {
    company_id: "IMP_A",
    month: "2026-08",
    score: 55,
    level: 0.5,
    state_index: 0.5,
    outlook: "stable",
    trend: "flat",
    watch: null,
    confidence: "medium",
    n_signals: 4,
    n_red: 0,
    months_of_history: 7,
    signals: {
      cash_buffer_days: 10,
      overdue_flow_rate_3m: 0.02,
      dscr_6m: 1.5,
      net_cash_flow_ratio_3m: 0.1,
    },
    ranks: {
      cash_buffer_days: 0.4,
      overdue_flow_rate_3m: 0.5,
      dscr_6m: 0.6,
      net_cash_flow_ratio_3m: 0.5,
    },
    rank_balance: 0.4,
    rank_overdue: 0.5,
    rank_dscr: 0.6,
    rank_inflows: 0.5,
    dimensions: {
      liquidity: 0.4,
      collections: 0.5,
      payments: 0.4,
      debt: 0.35,
      activity: 0.55,
    },
    peer_percentile: 40,
    history: [{ month: "2026-08", score: 55 }],
    drivers: [],
    projection_6m: { p10: 40, p50: 50, p90: 60 },
    origin: "ml",
    ...over,
  };
}

const company: CompanyRef = {
  company_id: "IMP_A",
  group_id: "G1",
  name: "Importada",
  country: "ES",
  currency: "EUR",
  n_companies_in_group: 1,
  imported: true,
};

const facts: CompanyFacts = {
  company_id: "IMP_A",
  cash_balance: 20_000,
  monthly_inflow_avg_3m: 8_000,
  monthly_outflow_avg_3m: 7_000,
  incumbent_banks: ["BBVA"],
  debt_by_type: {
    loan: { count: 1, outstanding: 50_000, granted: 50_000 },
  },
  contracts: [
    {
      product_id: "LOAN1",
      type: "loan",
      bank_name: "BBVA",
      granted: 50_000,
      outstanding: 50_000,
      annual_rate: 0.06,
      amortization_type: "constant_quote",
      total_periods: 60,
      interest_type: "fixed",
    },
  ],
  cash_series: [],
  invoice_aging: {
    issued_pending: 0,
    received_pending: 0,
    issued_overdue: 0,
    received_overdue: 0,
    overdue_flow_rate_3m: 0,
  },
  top_counterparties: [],
  implied_debt_rate: 0.06,
};

const deal: AcceptedDeal = {
  company_id: "IMP_A",
  action_id: "IMP_A-new_debt-0",
  product_id: "PROD_1",
  label: "Préstamo",
  issuer_name: "Banco Demo",
  amount: 10_000,
  projected_score: 60,
  projected_band: "BB",
  uplift: 4,
  accepted_at: "2026-09-19T12:00:00.000Z",
};

describe("materializeDealPack", () => {
  beforeEach(() => {
    clearStoreMemoryForTests();
    rmSync(runtimeDir, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the TS overlay when no CSVs were stored", async () => {
    await writeImportedPack({
      company,
      score: exported(),
      facts,
    });
    expect(await materializeDealPack(deal)).toBe(true);
    const pack = await readImportedPack("IMP_A");
    expect(pack?.score.score).not.toBe(55);
    expect(pack?.score.origin).toBe("deterministic");
  });

  it("calls Python /ingest on the mutated CSVs when a source exists", async () => {
    await writeImportedPack({
      company,
      score: exported(),
      facts,
    });
    await writeImportSource("IMP_A", {
      companies: [{ company_id: "IMP_A", group_id: "G1", currency: "EUR" }],
      banking_products: [
        { product_id: "CHK", company_id: "IMP_A", type: "checking" },
      ],
      transactions: [
        {
          transaction_id: "t1",
          company_id: "IMP_A",
          product_id: "CHK",
          date: "2026-07-15",
          amount: "100",
          status: "booked",
        },
      ],
      balances: [
        { product_id: "CHK", company_id: "IMP_A", date: "2026-09-01", balance: "200" },
      ],
    });

    const pythonScore = exported({ score: 71.4, origin: "ml" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/ingest");
        return new Response(
          JSON.stringify({
            companies: [company],
            scores: [pythonScore],
            summary: {},
            warnings: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    expect(await materializeDealPack(deal)).toBe(true);
    const pack = await readImportedPack("IMP_A");
    expect(pack?.score.score).toBe(71.4);
    expect(pack?.score.origin).toBe("ml");
    const src = await readImportSource("IMP_A");
    const tx = src?.tables.transactions?.find(
      (r) => r.transaction_id === "DEAL_TX_PROD_1"
    );
    expect(tx?.amount).toBe("10000");
    expect(tx?.date).toBe(DEAL_TX_DATE);
  });

  it("overlays in TS if Python ingest fails", async () => {
    await writeImportedPack({
      company,
      score: exported(),
      facts,
    });
    await writeImportSource("IMP_A", {
      companies: [{ company_id: "IMP_A", group_id: "G1", currency: "EUR" }],
      banking_products: [
        { product_id: "CHK", company_id: "IMP_A", type: "checking" },
      ],
      transactions: [],
      balances: [
        { product_id: "CHK", company_id: "IMP_A", date: "2026-09-01", balance: "200" },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 }))
    );
    expect(await materializeDealPack(deal)).toBe(true);
    const pack = await readImportedPack("IMP_A");
    expect(pack?.score.origin).toBe("deterministic");
    const src = await readImportSource("IMP_A");
    expect(
      src?.tables.transactions?.some((r) => r.transaction_id === "DEAL_TX_PROD_1")
    ).toBe(false);
  });
});
