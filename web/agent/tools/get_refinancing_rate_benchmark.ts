import { defineTool } from "eve/tools";
import { z } from "zod";
import { num, opportunities, percentile, percentileRank, requireCompany } from "../lib/data";

export default defineTool({
  description:
    "Compare a company's scheduled loans against every scheduled loan of the same currency in the sample: rate " +
    "percentiles for fixed-rate loans and for variable-rate spreads (kept separate because a spread is not a full rate), " +
    "plus each of the company's products with its rate percentile and the yearly saving if it were repriced at the peer " +
    "median. Only products with a formal schedule are covered; most debt has no schedule and will not appear.",
  inputSchema: z.object({
    company_id: z.string().regex(/^COMP_\d{4}$/),
    currency: z.string().length(3).optional().describe("Defaults to the company currency."),
  }),
  label: { start: ({ company_id }) => `Benchmark de tipos de ${company_id}` },
  async execute({ company_id, currency }) {
    const cur = currency ?? requireCompany(company_id)[0].company_currency;
    const screens = opportunities().filter(o => o.opportunity_type === "refinancing_screen" && o.currency === cur);
    const pool = { fixed: [] as number[], variable: [] as number[] };
    for (const s of screens) for (const p of s.product_evidence ?? []) {
      const r = num(p.rate);
      if (r !== null && r > 0) (p.interest_type === "variable" ? pool.variable : pool.fixed).push(r);
    }
    pool.fixed.sort((a, b) => a - b); pool.variable.sort((a, b) => a - b);
    const dist = (xs: number[]) => ({ count: xs.length, p25: percentile(xs, 25), p50: percentile(xs, 50), p75: percentile(xs, 75) });
    const own = screens.find(s => s.company_id === company_id);
    const products = (own?.product_evidence ?? []).map(p => {
      const peers = p.interest_type === "variable" ? pool.variable : pool.fixed;
      const rate = num(p.rate) ?? 0, outstanding = num(p.outstanding) ?? 0, median = percentile(peers, 50) ?? rate;
      return {
        ...p,
        rate_percentile_among_peers: percentileRank(peers, rate),
        yearly_saving_if_repriced_at_peer_median: rate > median ? Math.round(outstanding * (rate - median) * 100) / 100 : 0,
      };
    });
    return {
      company_id, currency: cur,
      peer_rates: { fixed_full_rate: dist(pool.fixed), variable_spread_only: dist(pool.variable) },
      company_products: products,
      note: products.length ? "Savings are proxies: fees, maturity, covenants and eligibility are unknown. Variable rows compare spreads only."
        : "This company has no scheduled loans in the sample; its debt cost can only be judged via implied_debt_rate.",
    };
  },
});
