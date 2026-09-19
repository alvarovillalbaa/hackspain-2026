import { defineTool } from "eve/tools";
import { z } from "zod";
import { opportunities, requireCompany } from "../lib/data";

const TYPES = [
  "idle_cash_review", "interest_cost_review", "refinancing_screen", "bank_fee_review", "overdue_invoice_review",
  "refund_leakage_review", "duplicate_transaction_review", "reconciliation_backlog", "discarded_reconciliation_review",
] as const;

export default defineTool({
  description:
    "Screening opportunities already detected for a company, each with its value, the metric it comes from, a caveat " +
    "that must be respected, and currency_rank: the company's position among all companies in the same currency AND " +
    "the same opportunity type (1 = largest). Ranks of different types are not comparable. refinancing_screen includes " +
    "product-level evidence (outstanding, rate, fixed/variable, stale_schedule).",
  inputSchema: z.object({
    company_id: z.string().regex(/^COMP_\d{4}$/),
    opportunity_type: z.enum(TYPES).optional().describe("Filter to one screen type."),
  }),
  label: { start: ({ company_id, opportunity_type }) => `Oportunidades de ${company_id}${opportunity_type ? ` (${opportunity_type})` : ""}` },
  async execute({ company_id, opportunity_type }) {
    requireCompany(company_id);
    const rows = opportunities().filter(o => o.company_id === company_id && (!opportunity_type || o.opportunity_type === opportunity_type));
    const totalByType = new Map<string, number>();
    for (const o of opportunities()) if (o.currency_rank !== null) totalByType.set(`${o.currency}|${o.opportunity_type}`, (totalByType.get(`${o.currency}|${o.opportunity_type}`) ?? 0) + 1);
    return {
      company_id,
      opportunities: rows.map(({ company_id: _c, rank_scope: _r, ...o }) => ({
        ...o,
        companies_ranked_in_same_currency_and_type: totalByType.get(`${o.currency}|${o.opportunity_type}`) ?? null,
      })),
    };
  },
});
