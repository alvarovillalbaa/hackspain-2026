import { defineTool } from "eve/tools";
import { z } from "zod";
import { getFacts } from "#lib/facts";

export default defineTool({
  description: "Monthly cash inflow/outflow/net series (up to 24 months).",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Cash series ${company_id}` },
  async execute({ company_id }) {
    const facts = getFacts(company_id);
    if (!facts) return { error: `Unknown company ${company_id}` };
    return { company_id, cash_series: facts.cash_series };
  },
});
