import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { loadJson } from "eve/evals/loaders";
import { RecommendationDecisionSchema } from "../../agent/lib/schemas";
import {
  collectOrchestratorMetrics,
  orchestratorGates,
  orchestratorPrompt,
  parseDecision,
  rankingOrderSoft,
  type Manifest,
  type ManifestCase,
} from "../lib/orchestrator-metrics";
import { repeatIndependent } from "../lib/repeat";

const doc = (await loadJson(
  "evals/data/calibration-manifest.json"
)) as Manifest;

const cases = doc.cases.filter((c) => c.modes.includes("orchestrator"));

export default cases.map((c: ManifestCase) =>
  defineEval({
    description: `Agentic calibration Mode B — ${c.row_id}`,
    tags: ["calibration", "slow", "orchestrator"],
    timeoutMs: 300_000,
    metadata: { row_id: c.row_id, company_id: c.company_id, mode: "orchestrator" },
    async test(t) {
      const message = orchestratorPrompt(c);
      const turns = await repeatIndependent(t, async (session) => {
        const turn = await session.send(message, {
          outputSchema: RecommendationDecisionSchema,
        });
        turn.expectOk();
        turn.outputMatches(RecommendationDecisionSchema);
        if (turn.data == null) {
          throw new Error(`No structured data for ${c.row_id}`);
        }
        return parseDecision(turn.data, c);
      });

      t.log(
        `calibration orchestrator ${c.row_id}: ${turns.length} decisions`
      );

      const metrics = collectOrchestratorMetrics(turns, c);
      for (const gate of orchestratorGates(metrics)) {
        t.check(
          gate.ok,
          satisfies((v: boolean) => v === true, `${gate.label} (${gate.detail})`)
        ).label(gate.label);
      }

      // Soft: full ranking order — ties below #1 are not material.
      t.check(
        rankingOrderSoft(metrics),
        satisfies((v: boolean) => v === true, "ranking order unanimous")
      )
        .label("soft:ranking_order")
        .soft();

      t.succeeded();
    },
  })
);
