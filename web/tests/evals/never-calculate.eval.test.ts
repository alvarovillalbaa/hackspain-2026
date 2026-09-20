/**
 * Thin wrapper around the never-calculate suite.
 * Skip unless EVAL_SUITE_ID=xray-never-calculate (or always run the unit twin).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const suiteId = process.env.EVAL_SUITE_ID;
const configured = suiteId === "xray-never-calculate";

describe.skipIf(!configured)("owned eval suite: never-calculate", () => {
  it("passes the official gate artifact", () => {
    const path = join(
      process.cwd(),
      "..",
      "artifacts",
      "evals",
      "never-calculate.json"
    );
    if (!existsSync(path)) {
      throw new Error(
        "never-calculate results missing — run npm run eval:never-calculate"
      );
    }
    const result = JSON.parse(readFileSync(path, "utf8")) as {
      eval_id: string;
      run_gate: { passed: boolean };
    };
    expect(result.eval_id).toBe("xray-never-calculate");
    expect(result.run_gate.passed).toBe(true);
  });
});
