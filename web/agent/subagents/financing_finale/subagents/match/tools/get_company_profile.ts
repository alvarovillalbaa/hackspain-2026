import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveCompany, getLiveFacts, getLiveDimensions } from "#lib/facts";

export default defineTool({
  description: "Company profile for match factors (cash cycle proxies, debt, banks).",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Profile ${company_id}` },
  async execute({ company_id }) {
    const company = await getLiveCompany(company_id);
    const facts = await getLiveFacts(company_id);
    const dim = await getLiveDimensions(company_id);
    if (!company || !facts) return { error: `Unknown company ${company_id}` };
    return {
      company,
      cash_balance: facts.cash_balance,
      monthly_inflow_avg_3m: facts.monthly_inflow_avg_3m,
      monthly_outflow_avg_3m: facts.monthly_outflow_avg_3m,
      implied_debt_rate: facts.implied_debt_rate,
      incumbent_banks: facts.incumbent_banks,
      dimensions: dim?.dimensions ?? null,
      signals: dim?.signals ?? null,
    };
  },
});
