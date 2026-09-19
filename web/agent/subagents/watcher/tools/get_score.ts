import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveScore } from "#lib/facts";

export default defineTool({
  description:
    "Get the company's Financial Health Score snapshot (0–100, band, outlook, trend, watch, drivers). Never recompute.",
  inputSchema: z.object({
    company_id: z.string().min(1),
  }),
  label: { start: ({ company_id }) => `Score ${company_id}` },
  async execute({ company_id }) {
    const score = await getLiveScore(company_id);
    if (!score) return { error: `Unknown company ${company_id}` };
    return score;
  },
});
