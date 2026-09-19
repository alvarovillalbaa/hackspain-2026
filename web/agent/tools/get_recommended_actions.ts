import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  getLiveCompany,
  getLiveExportedScore,
  getLiveFacts,
  getLiveScore,
} from "../lib/facts";
import { recommendActions } from "../../lib/xray/recommend-actions";

export default defineTool({
  description:
    "Recommended treasury actions for a company, derived from cash/debt/invoices and Health Scorer signals. " +
    "Amounts and uplift are deterministic (not LLM). Each rationale cites field names. " +
    "When rewriting for the ficha, put tooltip-quality 'why this company' in reasoning (no invented amounts).",
  inputSchema: z.object({ company_id: z.string().regex(/^COMP_\d{4}$/) }),
  label: { start: ({ company_id }) => `Acciones de ${company_id}` },
  async execute({ company_id }) {
    // Live accessors so a company imported from CSV is visible here too.
    const snapshot = await getLiveScore(company_id);
    if (!snapshot) throw new Error(`Unknown company_id ${company_id}. IDs look like COMP_0058.`);
    const actions = recommendActions({
      snapshot,
      facts: await getLiveFacts(company_id),
      exported: await getLiveExportedScore(company_id),
      currency: (await getLiveCompany(company_id))?.currency,
    });
    return {
      company_id,
      actions: actions.map(({ dimension_deltas: _d, ...a }) => a),
    };
  },
});
