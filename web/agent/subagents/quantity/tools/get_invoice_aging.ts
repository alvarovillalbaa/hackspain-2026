import { defineTool } from "eve/tools";
import { z } from "zod";
import { getFacts } from "#lib/facts";

export default defineTool({
  description:
    "Invoice aging: issued/received pending and overdue. Overdue uses pending_amount + due_date, never payment_date.",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Invoice aging ${company_id}` },
  async execute({ company_id }) {
    const facts = getFacts(company_id);
    if (!facts) return { error: `Unknown company ${company_id}` };
    return {
      company_id,
      invoice_aging: facts.invoice_aging,
      top_counterparties: facts.top_counterparties,
    };
  },
});
