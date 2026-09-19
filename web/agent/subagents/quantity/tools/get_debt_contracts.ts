import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveFacts } from "#lib/facts";

export default defineTool({
  description:
    "Real debt contracts from debt_schedule_config (rates, outstanding, amortization). Prefer these over interest_charge.",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Debt contracts ${company_id}` },
  async execute({ company_id }) {
    const facts = await getLiveFacts(company_id);
    if (!facts) return { error: `Unknown company ${company_id}` };
    return {
      company_id,
      contracts: facts.contracts,
      debt_by_type: facts.debt_by_type,
      implied_debt_rate: facts.implied_debt_rate,
    };
  },
});
