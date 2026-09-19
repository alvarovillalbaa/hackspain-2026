import { defineTool } from "eve/tools";
import { z } from "zod";
import { compact, companyMetrics, groupMetrics, requireCompany } from "../lib/data";

export default defineTool({
  description:
    "Cash-pooling / intra-group netting view for the group a company belongs to, per currency: total positive cash and " +
    "debt across subsidiaries, what each company can already offset alone, the incremental netting only visible at group " +
    "level, and its yearly saving proxy at the group's pooled implied rate. Also lists sister companies with their cash and debt.",
  inputSchema: z.object({ company_id: z.string().regex(/^COMP_\d{4}$/) }),
  label: { start: ({ company_id }) => `Netting del grupo de ${company_id}` },
  async execute({ company_id }) {
    const groupId = requireCompany(company_id)[0].group_id;
    const siblings = companyMetrics()
      .filter(r => r.group_id === groupId)
      .map(r => ({ company_id: r.company_id, currency: r.metric_currency, cash_balance: r.cash_balance, debt_outstanding_abs_proxy: r.debt_outstanding_abs_proxy, implied_debt_rate: r.implied_debt_rate }))
      .filter(r => r.cash_balance !== "0" || r.debt_outstanding_abs_proxy !== "0");
    return {
      company_id,
      group_id: groupId,
      by_currency: groupMetrics().filter(g => g.group_id === groupId).map(g => { const { group_id: _g, ...rest } = compact(g); return rest; }),
      companies: siblings,
    };
  },
});
