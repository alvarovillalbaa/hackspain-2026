import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveFacts, getLiveScore, getLiveDimensions } from "#lib/facts";

export default defineTool({
  description:
    "Rate context: implied current debt rate, band, DSCR signal, and a fair-rate hint by band.",
  inputSchema: z.object({ company_id: z.string() }),
  label: { start: ({ company_id }) => `Rate context ${company_id}` },
  async execute({ company_id }) {
    const facts = await getLiveFacts(company_id);
    const score = await getLiveScore(company_id);
    const dim = await getLiveDimensions(company_id);
    if (!facts || !score) return { error: `Unknown company ${company_id}` };

    const bandFairRate: Record<string, number> = {
      AAA: 0.025,
      AA: 0.028,
      A: 0.032,
      BBB: 0.038,
      BB: 0.045,
      B: 0.055,
      CCC: 0.07,
      CC: 0.09,
      C: 0.12,
    };

    return {
      company_id,
      band: score.band,
      implied_debt_rate: facts.implied_debt_rate,
      fair_rate_hint: bandFairRate[score.band] ?? 0.05,
      dscr_6m: dim?.signals.dscr_6m ?? null,
      contracts: facts.contracts.slice(0, 5),
    };
  },
});
