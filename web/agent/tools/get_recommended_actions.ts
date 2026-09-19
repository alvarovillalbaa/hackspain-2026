import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCompany, getFacts, getExportedScore, getScore } from "../lib/facts";
import { recommendActions } from "../../lib/xray/recommend-actions";

export default defineTool({
  description:
    "Recommended treasury actions for a company, derived from cash/debt/invoices and Health Scorer signals. " +
    "Amounts and uplift are deterministic (not LLM). Each rationale cites field names. Empty list means no screen fired.",
  inputSchema: z.object({ company_id: z.string().regex(/^COMP_\d{4}$/) }),
  label: { start: ({ company_id }) => `Acciones de ${company_id}` },
  async execute({ company_id }) {
    const snapshot = getScore(company_id);
    if (!snapshot) throw new Error(`Unknown company_id ${company_id}. IDs look like COMP_0058.`);
    const actions = recommendActions({
      snapshot,
      facts: getFacts(company_id),
      exported: getExportedScore(company_id),
      currency: getCompany(company_id)?.currency,
    });
    return {
      company_id,
      actions: actions.map(({ dimension_deltas: _d, ...a }) => a),
    };
  },
});
