/**
 * LLM-as-judge actions copy — skip unless EVAL_SERVICE_URL is set.
 * Does not inline thresholds; only asserts the official gate payload.
 */
import { describe, expect, it } from "vitest";

const suiteId = process.env.EVAL_SUITE_ID;
const serviceUrl = process.env.EVAL_SERVICE_URL;

describe.skipIf(!suiteId || !serviceUrl || suiteId !== "xray-actions-copy")(
  "owned eval suite: actions-copy (LLM judge)",
  () => {
    it("passes the official gate", async () => {
      const res = await fetch(`${serviceUrl}/runs`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.EVAL_SERVICE_TOKEN ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          suite_id: suiteId,
          suite_version: process.env.EVAL_SUITE_VERSION,
        }),
      });
      if (res.status >= 500) {
        throw new Error("eval service error, route to ai-evals");
      }
      const result = (await res.json()) as {
        eval_id: string;
        run_gate: { passed: boolean };
      };
      expect(result.eval_id).toBe(suiteId);
      expect(result.run_gate.passed).toBe(true);
    });
  }
);
