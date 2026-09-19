import { defineTool } from "eve/tools";
import { z } from "zod";
import { companyMetrics, num, percentile, percentileRank, requireCompany } from "../lib/data";

const METRICS = [
  "cash_balance", "debt_outstanding_abs_proxy", "idle_cash_vs_debt", "implied_debt_rate", "idle_cash_savings_proxy",
  "interest_charge_outflow", "fee_outflow", "fee_transaction_count", "debt_repayment_outflow", "loc_granted", "loc_drawn",
  "loc_undrawn", "booked_inflow", "booked_outflow", "booked_transaction_count", "overdue_invoice_abs_exposure",
  "overdue_pending_positive", "overdue_pending_negative", "overdue_invoice_count", "duplicate_candidate_abs_amount",
  "duplicate_candidate_count", "reconciliation_pending_abs_amount", "collection_refund_outflow", "annual_interest_cost_proxy",
  "refinancing_outstanding", "debt_product_count", "history_months",
] as const;

export default defineTool({
  description:
    "Benchmark one company metric against all other companies operating in the same currency: p10/p25/p50/p75/p90 of the " +
    "peer distribution and the company's percentile rank. Raw totals depend on company size, so pass divide_by to compare " +
    "ratios instead, e.g. fee_outflow / booked_transaction_count (fee per transaction), interest_charge_outflow / " +
    "debt_outstanding_abs_proxy (cost of debt), loc_drawn / loc_granted (line utilisation), overdue_pending_positive / " +
    "booked_inflow. Peers with a zero denominator are excluded. Use this to say whether a value is high or low for its peers.",
  inputSchema: z.object({
    company_id: z.string().regex(/^COMP_\d{4}$/),
    metric: z.enum(METRICS),
    divide_by: z.enum(METRICS).optional(),
    currency: z.string().length(3).optional().describe("Defaults to the company currency."),
    exclude_zero_peers: z.boolean().default(true).describe("Ignore peers where the metric is 0 (usually 'not observed')."),
  }),
  label: { start: ({ company_id, metric, divide_by }) => `Percentil de ${metric}${divide_by ? `/${divide_by}` : ""} para ${company_id}` },
  async execute({ company_id, metric, divide_by, currency, exclude_zero_peers }) {
    const cur = currency ?? requireCompany(company_id)[0].company_currency;
    const value = (r: Record<string, string>) => {
      const a = num(r[metric]);
      if (a === null) return null;
      if (!divide_by) return a;
      const b = num(r[divide_by]);
      return b ? a / b : null;
    };
    const rows = companyMetrics().filter(r => r.metric_currency === cur);
    const own = rows.find(r => r.company_id === company_id);
    const ownValue = own ? value(own) : null;
    const peers = rows.filter(r => r.company_id !== company_id).map(value)
      .filter((v): v is number => v !== null && Number.isFinite(v) && (!exclude_zero_peers || v !== 0))
      .sort((a, b) => a - b);
    return {
      company_id, currency: cur, metric, divide_by: divide_by ?? null,
      company_value: ownValue,
      company_percentile: ownValue === null ? null : percentileRank(peers, ownValue),
      peer_count: peers.length,
      peers: { p10: percentile(peers, 10), p25: percentile(peers, 25), p50: percentile(peers, 50), p75: percentile(peers, 75), p90: percentile(peers, 90) },
      note: "Percentile 90 means the company is above 90% of peers. For cost-type metrics high is bad; for cash/undrawn it is good.",
    };
  },
});
