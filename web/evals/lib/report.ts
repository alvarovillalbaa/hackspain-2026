import fs from "node:fs";
import path from "node:path";
import type {
  EvalReporter,
  EveEvalCompleteContext,
} from "eve/evals/reporters";
import type {
  EveEval,
  EveEvalResult,
  EveEvalRunSummary,
  EveEvalTarget,
} from "eve/evals";

function calibrationOutDir(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "web") {
    return path.resolve(cwd, "..", "artifacts", "calibration");
  }
  return path.resolve(cwd, "artifacts", "calibration");
}

interface CalibrationArtifact {
  finished_at: string;
  target: { kind: string; url?: string };
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    scored: number;
    errored: number;
  };
  evals: {
    id: string;
    verdict: string;
    assertions: {
      name: string;
      passed: boolean;
      score?: number;
      message?: string;
    }[];
  }[];
}

/**
 * Writes artifacts/calibration/latest.json after the run.
 * Does not replace Eve's own .eve/evals/ artifacts.
 */
export function CalibrationReporter(): EvalReporter {
  const rows: CalibrationArtifact["evals"] = [];
  let targetMeta: CalibrationArtifact["target"] = { kind: "unknown" };

  return {
    onRunStart(_evaluations: readonly EveEval[], target: EveEvalTarget) {
      targetMeta = { kind: target.kind, url: target.url };
      rows.length = 0;
    },
    onEvalComplete(result: EveEvalResult, _ctx?: EveEvalCompleteContext) {
      rows.push({
        id: result.id,
        verdict: result.verdict,
        assertions: result.assertions.map((a) => ({
          name: a.name,
          passed: a.passed,
          score: a.score,
          message: a.message,
        })),
      });
    },
    onRunComplete(summary: EveEvalRunSummary) {
      const dir = calibrationOutDir();
      fs.mkdirSync(dir, { recursive: true });
      const total =
        summary.passed + summary.failed + summary.scored + summary.skipped;
      const artifact: CalibrationArtifact = {
        finished_at: new Date().toISOString(),
        target: targetMeta,
        summary: {
          total,
          passed: summary.passed,
          failed: summary.failed,
          skipped: summary.skipped,
          scored: summary.scored,
          errored: summary.errored,
        },
        evals: rows,
      };
      fs.writeFileSync(
        path.join(dir, "latest.json"),
        JSON.stringify(artifact, null, 2)
      );
      fs.writeFileSync(
        path.join(
          dir,
          `run-${artifact.finished_at.replace(/[:.]/g, "-")}.json`
        ),
        JSON.stringify(artifact, null, 2)
      );
    },
  };
}
