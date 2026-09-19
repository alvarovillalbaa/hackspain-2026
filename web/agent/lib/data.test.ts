// Retrieval tools over a tiny synthetic copy of the pipeline outputs. No dataset, no model.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "xray-outputs-"));
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);

beforeAll(() => {
  write("company_metrics.csv", [
    "company_id,group_id,company_currency,metric_currency,booked_transaction_count,fee_transaction_count,history_months,booked_outflow,interest_charge_outflow,fee_outflow,cash_balance,debt_outstanding_abs_proxy,idle_cash_vs_debt,implied_debt_rate_raw,implied_debt_rate,idle_cash_savings_proxy,loc_granted,loc_drawn,loc_undrawn,debt_sign_warning",
    'COMP_0001,GROUP_0001,EUR,EUR,100,10,9,50000,300,1000,500,1000,500,0.04,0.04,20,1000,200,800,"Source signs observed: negative,positive"',
    "COMP_0001,GROUP_0001,EUR,USD,5,0,9,100,0,0,50,0,0,0,0,0,0,0,0,no debt source observed",
    "COMP_0002,GROUP_0001,EUR,EUR,200,20,9,80000,0,200,2000,0,0,0,0,0,0,0,0,no debt source observed",
    "COMP_0003,GROUP_0002,EUR,EUR,50,50,9,10000,0,5000,0,0,0,0,0,0,0,0,0,no debt source observed",
  ].join("\n"));
  write("group_metrics.csv", [
    "group_id,currency,company_count,group_cash_positive,group_debt,company_level_offset,group_netting_incremental,pooled_implied_rate,group_netting_savings_proxy",
    "GROUP_0001,EUR,2,2500,1000,500,500,0.04,20",
  ].join("\n"));
  write("working_capital_monthly.csv", [
    "company_id,currency,month,inflow,outflow,net,collection_inflow,debt_service_outflow,cash_end_proxy,receivables_open,receivables_overdue,receivables_overdue_90d,payables_open,receivables_late_days_p50",
    "COMP_0001,EUR,2026-07,100,80,20,60,10,480,30,30,30,70,",
    "COMP_0001,EUR,2026-08,0,0,0,0,0,500,30,30,30,70,",
    "COMP_0001,EUR,2026-09,0,0,0,0,0,500,30,30,30,70,1",
  ].join("\n"));
  write("opportunities.json", JSON.stringify([
    { company_id: "COMP_0001", currency: "EUR", opportunity_type: "bank_fee_review", screening_value: "1000", evidence_metric: "fee_outflow", caveat: "no benchmark", currency_rank: 2, rank_scope: "currency_and_type" },
    { company_id: "COMP_0003", currency: "EUR", opportunity_type: "bank_fee_review", screening_value: "5000", evidence_metric: "fee_outflow", caveat: "no benchmark", currency_rank: 1, rank_scope: "currency_and_type" },
    { company_id: "COMP_0001", currency: "EUR", opportunity_type: "refinancing_screen", screening_value: "40", evidence_metric: "sum", caveat: "screen", currency_rank: 1, rank_scope: "currency_and_type",
      product_evidence: [{ product_id: "D1", outstanding: "800", outstanding_source: "debt_products", rate: "0.05", interest_type: "fixed", annual_interest_cost_proxy: "40", next_payment_date: "2026-10-01", stale_schedule: false }] },
    { company_id: "COMP_0002", currency: "EUR", opportunity_type: "refinancing_screen", screening_value: "30", evidence_metric: "sum", caveat: "screen", currency_rank: 2, rank_scope: "currency_and_type",
      product_evidence: [{ product_id: "D2", outstanding: "1000", outstanding_source: "debt_products", rate: "0.03", interest_type: "fixed", annual_interest_cost_proxy: "30", next_payment_date: "2026-10-01", stale_schedule: false }] },
    { company_id: "COMP_0003", currency: "EUR", opportunity_type: "refinancing_screen", screening_value: "30", evidence_metric: "sum", caveat: "screen", currency_rank: 3, rank_scope: "currency_and_type",
      product_evidence: [{ product_id: "D3", outstanding: "1000", outstanding_source: "debt_products", rate: "0.03", interest_type: "fixed", annual_interest_cost_proxy: "30", next_payment_date: "2026-10-01", stale_schedule: false },
                         { product_id: "D4", outstanding: "1000", outstanding_source: "debt_products", rate: "0.02", interest_type: "variable", annual_interest_cost_proxy: "20", next_payment_date: "2026-10-01", stale_schedule: true }] },
  ]));
  write("data_quality.json", JSON.stringify({ dataset_as_of_date: "2026-09-01", notes: ["n1"], company_count: 3, stale_refinancing_schedule_count: 0 }));
  vi.stubEnv("PIPELINE_OUTPUTS", dir);
  vi.resetModules();
});

const tool = async (name: string) => (await import(`../tools/${name}.ts`)).default as {
  inputSchema: { parse: (v: unknown) => unknown };
  execute: (input: never, ctx: unknown) => Promise<Record<string, unknown>>;
};
const run = async (name: string, input: Record<string, unknown>) => {
  const t = await tool(name);
  return t.execute(t.inputSchema.parse(input) as never, {});
};

describe("retrieval tools over pipeline outputs", () => {
  it("overview groups rows by currency, drops zero fields and keeps the group id", async () => {
    const out = await run("get_company_overview", { company_id: "COMP_0001" });
    expect(out.group_id).toBe("GROUP_0001");
    expect(Object.keys(out.by_currency as object).sort()).toEqual(["EUR", "USD"]);
    const eur = (out.by_currency as Record<string, Record<string, string>>).EUR;
    expect(eur.cash_balance).toBe("500");
    expect(eur).not.toHaveProperty("company_id");
    expect((out.by_currency as Record<string, Record<string, string>>).USD).not.toHaveProperty("debt_outstanding_abs_proxy");
  });

  it("rejects unknown or malformed company ids", async () => {
    await expect(run("get_company_overview", { company_id: "COMP_9999" })).rejects.toThrow(/Unknown company_id/);
    await expect(run("get_company_overview", { company_id: "nope" })).rejects.toThrow();
  });

  it("returns the last N months in order and defaults to the company currency", async () => {
    const out = await run("get_working_capital_series", { company_id: "COMP_0001", months: 2 });
    expect(out.currency).toBe("EUR");
    expect((out.months as { month: string }[]).map(m => m.month)).toEqual(["2026-08", "2026-09"]);
  });

  it("keeps caveats, evidence and the size of the ranking pool", async () => {
    const out = await run("get_opportunities", { company_id: "COMP_0001", opportunity_type: "bank_fee_review" });
    const [o] = out.opportunities as Record<string, unknown>[];
    expect(o.caveat).toBe("no benchmark");
    expect(o.companies_ranked_in_same_currency_and_type).toBe(2);
  });

  it("group netting lists sister companies per currency, only those with cash or debt", async () => {
    const out = await run("get_group_netting", { company_id: "COMP_0001" });
    const rows = (out.companies as { company_id: string; currency: string }[]).map(c => `${c.company_id}/${c.currency}`).sort();
    expect(rows).toEqual(["COMP_0001/EUR", "COMP_0001/USD", "COMP_0002/EUR"]); // COMP_0003 is another group
    expect((out.by_currency as { group_netting_incremental: string }[])[0].group_netting_incremental).toBe("500");
  });

  it("peer percentiles compare ratios and exclude zero-denominator peers", async () => {
    const out = await run("get_peer_percentiles", { company_id: "COMP_0001", metric: "fee_outflow", divide_by: "fee_transaction_count" });
    expect(out.company_value).toBe(100); // 1000 / 10
    expect(out.peer_count).toBe(2); // COMP_0002 (10/tx) and COMP_0003 (100/tx)
    expect(out.company_percentile).toBe(50); // above one of two peers
  });

  it("refinancing benchmark separates fixed from variable and prices the gap to the peer median", async () => {
    const out = await run("get_refinancing_rate_benchmark", { company_id: "COMP_0001" });
    const rates = out.peer_rates as { fixed_full_rate: { count: number; p50: number }; variable_spread_only: { count: number } };
    expect(rates.fixed_full_rate).toMatchObject({ count: 3, p50: 0.03 }); // pool = [0.03, 0.03, 0.05]; variable kept apart
    expect(rates.variable_spread_only.count).toBe(1);
    const [p] = out.company_products as { rate_percentile_among_peers: number; yearly_saving_if_repriced_at_peer_median: number }[];
    expect(p.rate_percentile_among_peers).toBe(67); // 0.05 above 2 of 3
    expect(p.yearly_saving_if_repriced_at_peer_median).toBe(16); // 800 × (0.05 − 0.03)
  });
});
