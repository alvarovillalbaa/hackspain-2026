import { defineTool } from "eve/tools";
import { z } from "zod";
import { getLiveExportedScore, getLiveScore } from "#lib/facts";
import { evaluateWatch, type WatchAlert } from "#lib/watch-rules";

export default defineTool({
  description:
    "Deterministic watch gate for one or more companies. Returns structured alerts from the Health Score JSON " +
    "(outlook+trend, watch event, DSCR < 1.2). Empty alerts means do not notify. Never invent rules.",
  inputSchema: z.object({
    company_id: z.string().min(1).optional(),
    company_ids: z.array(z.string().min(1)).max(20).optional(),
  }),
  label: {
    start: ({ company_id, company_ids }) =>
      company_id
        ? `Evaluar watch ${company_id}`
        : `Evaluar watch (${company_ids?.length ?? 0} empresas)`,
  },
  async execute({ company_id, company_ids }) {
    const unique = [
      ...new Set([
        ...(company_id ? [company_id] : []),
        ...(company_ids ?? []),
      ]),
    ];
    if (unique.length === 0) {
      return {
        error: "Pass company_id or company_ids",
        alerts: [] as WatchAlert[],
      };
    }

    const alerts: WatchAlert[] = [];
    const missing: string[] = [];
    for (const id of unique) {
      const snapshot = await getLiveScore(id);
      if (!snapshot) {
        missing.push(id);
        continue;
      }
      const exported = await getLiveExportedScore(id);
      alerts.push(
        ...evaluateWatch(snapshot, {
          dscr_6m: exported?.signals.dscr_6m ?? null,
        })
      );
    }

    return { alerts, missing, count: alerts.length };
  },
});
