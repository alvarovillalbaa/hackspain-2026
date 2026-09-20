/**
 * Offline smoke: measurement path over warm recommendations.json
 * (no LLM). Proves parse → metrics → gates without Gateway spend.
 */
import { describe, expect, it } from "vitest";
import recommendations from "@/lib/xray/dataset/recommendations.json";
import {
  collectOrchestratorMetrics,
  orchestratorGates,
  parseDecision,
  type ManifestCase,
} from "@/evals/lib/orchestrator-metrics";
import { cvWithin } from "@/evals/lib/dispersion";

type WarmEntry = {
  decision: unknown;
  headline?: string;
};

const warm = recommendations as Record<string, WarmEntry>;

describe("orchestrator metrics smoke (warm fixture)", () => {
  it("identical repeats pass CV and unanimity gates", () => {
    const key = "COMP_0001:COMP_0001-new_debt-0";
    const entry = warm[key];
    expect(entry).toBeDefined();

    const c: ManifestCase = {
      row_id: "cal-0001-new_debt",
      company_id: "COMP_0001",
      action_id: "COMP_0001-new_debt-0",
      action_kind: "new_debt",
      modes: ["orchestrator"],
    };

    const decision = parseDecision(entry!.decision, c);
    const decisions = Array.from({ length: 8 }, () =>
      structuredClone(decision)
    );
    const metrics = collectOrchestratorMetrics(decisions, c);

    expect(cvWithin(metrics.idealAmounts, 0.02)).toBe(true);
    expect(cvWithin(metrics.winnerMatches, 0.02)).toBe(true);

    const gates = orchestratorGates(metrics);
    const failed = gates.filter((g) => !g.ok);
    // Fidelity may fail if warm decisions predate reassemble semantics —
    // repeatability gates must still pass.
    const repeatability = failed.filter(
      (g) => g.label.startsWith("cv:") || g.label.startsWith("unanimous:")
    );
    expect(repeatability).toEqual([]);
  });
});
