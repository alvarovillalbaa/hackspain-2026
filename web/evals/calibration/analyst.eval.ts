import { defineEval } from "eve/evals";
import { satisfies, similarity } from "eve/evals/expect";
import { loadJson } from "eve/evals/loaders";
import {
  extractCitedScore,
  extractFigures,
  hasAnalystSections,
} from "../lib/extract";
import { groundingRate, legalFigures } from "../lib/grounding";
import {
  cvWithin,
  isUnanimous,
  modalAgreement,
} from "../lib/dispersion";
import type { Manifest, ManifestCase } from "../lib/orchestrator-metrics";
import { analystPrompt } from "../lib/orchestrator-metrics";
import { repeatIndependent } from "../lib/repeat";
import { CV_MAX, GROUNDING_MIN } from "../lib/thresholds";

const doc = (await loadJson(
  "evals/data/calibration-manifest.json"
)) as Manifest;

const cases = doc.cases.filter((c) => c.modes.includes("analyst"));

export default cases.map((c: ManifestCase) =>
  defineEval({
    description: `Agentic calibration Mode A — ${c.row_id}`,
    tags: ["calibration", "slow", "analyst"],
    timeoutMs: 300_000,
    metadata: { row_id: c.row_id, company_id: c.company_id, mode: "analyst" },
    async test(t) {
      const message = analystPrompt(c.company_id);
      const legal = legalFigures(c.company_id);

      const runs = await repeatIndependent(t, async (session) => {
        const turn = await session.send(message);
        turn.expectOk();
        const reply = turn.message ?? "";
        const toolNames = turn.toolCalls.map((tc) => tc.name);
        return { reply, toolNames, turn };
      });

      t.log(`calibration analyst ${c.row_id}: ${runs.length} replies`);

      // Unanimity: get_company_overview on every run
      const overviewHits = runs.map((r) =>
        r.toolNames.includes("get_company_overview") ? "yes" : "no"
      );
      t.check(
        isUnanimous(overviewHits) && overviewHits[0] === "yes",
        satisfies(
          (v: boolean) => v === true,
          `get_company_overview on all runs (${overviewHits.join("|")})`
        )
      ).label("unanimous:get_company_overview");

      // Unanimity: required sections
      const sectionOk = runs.map((r) => hasAnalystSections(r.reply).ok);
      t.check(
        sectionOk.every(Boolean),
        satisfies(
          (v: boolean) => v === true,
          `analyst sections present (${sectionOk.filter(Boolean).length}/${sectionOk.length})`
        )
      ).label("unanimous:analyst_sections");

      // Grounding ≥ 98% across all cited figures pooled
      const allFigures = runs.flatMap((r) => extractFigures(r.reply));
      const ground = groundingRate(allFigures, legal);
      t.check(
        ground.rate >= GROUNDING_MIN,
        satisfies(
          (v: boolean) => v === true,
          `grounding ${ground.grounded}/${ground.total}=${(ground.rate * 100).toFixed(1)}%`
        )
      ).label("grounding:rate");

      // CV of cited headline score
      const citedScores = runs
        .map((r) => extractCitedScore(r.reply))
        .filter((n): n is number => n != null);
      t.check(
        citedScores.length >= Math.ceil(runs.length * 0.5) &&
          cvWithin(citedScores, CV_MAX),
        satisfies(
          (v: boolean) => v === true,
          `cited score CV n=${citedScores.length} values=${citedScores.join(",")}`
        )
      ).label("cv:cited_score");

      // Soft: tool-set modal agreement
      const toolSets = runs.map((r) => [...new Set(r.toolNames)].sort().join(","));
      const toolAgree = modalAgreement(toolSets);
      t.check(
        toolAgree.agreement,
        satisfies((v: number) => v >= 0, "tool-set agreement tracked")
      )
        .label("soft:tool_set_agreement")
        .soft();
      t.log(`tool-set modal agreement=${toolAgree.agreement.toFixed(2)}`);

      // Soft: pairwise reply similarity vs first reply (wording drift)
      const first = runs[0]?.reply ?? "";
      for (let i = 1; i < runs.length; i++) {
        t.check(runs[i]!.reply, similarity(first))
          .label(`soft:similarity_vs_run0_${i}`)
          .soft();
      }

      t.succeeded();
    },
  })
);
