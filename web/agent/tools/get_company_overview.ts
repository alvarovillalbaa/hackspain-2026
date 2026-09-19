import { defineTool } from "eve/tools";
import { z } from "zod";
import { compact, dataQuality, requireCompany } from "../lib/data";

export default defineTool({
  description:
    "Aggregate metrics for one company, one row per currency the company operates in (cash, debt, lines of credit, " +
    "interest and fees paid, overdue invoices, duplicates, reconciliation, idle-cash saving proxy, implied debt rate). " +
    "Always call this first. Fields absent from a row are zero. Never add or compare figures across currencies.",
  inputSchema: z.object({ company_id: z.string().regex(/^COMP_\d{4}$/, "e.g. COMP_0058") }),
  label: { start: ({ company_id }) => `Leer métricas de ${company_id}` },
  async execute({ company_id }) {
    const rows = requireCompany(company_id);
    const q = dataQuality();
    return {
      company_id,
      group_id: rows[0].group_id,
      company_currency: rows[0].company_currency,
      as_of: q.dataset_as_of_date,
      by_currency: Object.fromEntries(rows.map(r => {
        const { company_id: _c, group_id: _g, company_currency: _cc, metric_currency, ...rest } = compact(r);
        return [metric_currency, rest];
      })),
      data_quality_notes: q.notes,
    };
  },
});
