import { defineTool } from "eve/tools";
import { z } from "zod";
import { compact, requireCompany, workingCapital } from "../lib/data";

export default defineTool({
  description:
    "Monthly working-capital series for a company and currency: inflow, outflow, net, collection_inflow, " +
    "debt_service_outflow, cash_end_proxy (reconstructed backwards from the single as-of balance; early months can drift), " +
    "receivables_open / receivables_overdue / receivables_overdue_90d, payables_open, receivables_late_days_p50. " +
    "Use it to see trends (liquidity, overdue build-up, payment behaviour) behind a score component.",
  inputSchema: z.object({
    company_id: z.string().regex(/^COMP_\d{4}$/),
    currency: z.string().length(3).optional().describe("Defaults to the company currency."),
    months: z.number().int().min(1).max(25).default(6).describe("How many most-recent months to return."),
  }),
  label: { start: ({ company_id, months }) => `Serie de circulante de ${company_id} (${months} meses)` },
  async execute({ company_id, currency, months }) {
    const cur = currency ?? requireCompany(company_id)[0].company_currency;
    const rows = workingCapital().filter(r => r.company_id === company_id && r.currency === cur);
    if (!rows.length) return { company_id, currency: cur, months: [], note: "No transactions or invoices observed in this currency." };
    return {
      company_id,
      currency: cur,
      months: rows.slice(-months).map(r => { const { company_id: _c, currency: _cur, ...rest } = compact(r); return rest; }),
    };
  },
});
