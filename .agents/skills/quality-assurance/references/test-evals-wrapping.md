# Eval Wrapping Reference

The contract for `tests/evals/`. These tests do **not** define evaluations. They are a thin wrapping
layer that invokes an eval suite the eval system already owns and asserts on the gate it returns.

`ai-evals` owns specs, datasets, graders, calibration, thresholds, and the gate cascade.
`tests/evals/` owns exactly one claim: *the build currently in this repository passes the suite the
eval system already defines.*

## Contents

- [What a file here may and may not contain](#what-a-file-here-may-and-may-not-contain)
- [Two deployment shapes](#two-deployment-shapes)
- [Configuration](#configuration)
- [Skip when unconfigured](#skip-when-unconfigured)
- [Assert the gate, not the score](#assert-the-gate-not-the-score)
- [Exit-code mapping](#exit-code-mapping)
- [Sketches](#sketches)
- [Boundary to ai-evals](#boundary-to-ai-evals)
- [Anti-patterns](#anti-patterns)

## What a file here may and may not contain

**Must not contain** any of: dataset rows, expected outputs, grader or rubric definitions, score
thresholds, pass-rate minimums, prompt versions, judge model names, or scoring arithmetic. If any of
these appears, the evaluation has been redefined inside the test suite and there are now two sources
of truth that will diverge.

**Must contain exactly four things:**

1. An **external suite reference** — an identifier and a version, never inline content.
2. An **invocation** of the eval system that already exists.
3. **Assertions on the official gate** the eval system returned.
4. **Skip semantics** for when the eval system is not configured.

## Two deployment shapes

**Shape A — offline deterministic runner.** The suite is defined by `ai-evals` as a spec and dataset
pair; the test shells out to the offline runner. No network and no model credentials are involved,
so this shape may run in CI where the repository accepts the cost.

**Shape B — hosted eval service.** The test posts a run request naming the suite identifier and
version to an eval service that already exists, then reads back the official gate. Credentials are
required, so this shape is on-demand and pre-release only.

Both shapes obey the same contract. The difference is transport, not semantics.

## Configuration

Supplied at runtime, never embedded. No variable gets a default pointing at a real endpoint, a real
suite, or a real credential.

| Variable | Shape | Meaning |
| --- | --- | --- |
| `EVAL_SUITE_ID` | A, B | the suite the eval system already owns |
| `EVAL_SUITE_VERSION` | A, B | the pinned suite version or sample manifest identifier |
| `EVAL_SPEC_PATH` | A | path to the spec owned by `ai-evals` |
| `EVAL_DATASET_PATH` | A | path to the dataset owned by `ai-evals` |
| `EVAL_RUNNER` | A | path to the offline runner |
| `EVAL_SERVICE_URL` | B | the eval service endpoint |
| `EVAL_SERVICE_TOKEN` | B | the eval service credential |

## Skip when unconfigured

When the required variables are absent, **skip — do not fail, and do not fall back to a local
approximation.** A skipped eval test is an honest "not measured here". A locally approximated one is
a fabricated pass.

This is also the primary mechanism keeping evals out of ordinary CI: with nothing configured, the
ordinary suite reports skips and moves on. Pair it with a deselected `evals` marker for defence in
depth, so an accidentally configured environment still does not pull an eval run into a PR gate.

## Assert the gate, not the score

The eval system already computed a pass or fail decision using criteria it owns. Assert on that
decision.

Two integrity assertions are also recommended, because they catch the failure mode where the run
silently evaluated a different suite than the one intended: assert the returned suite identifier
matches the requested one, and the returned manifest version matches the requested version.

**Forbidden:** asserting a raw score against a number chosen in the test file. That number is a
threshold, thresholds are part of the eval definition, and the eval definition lives in the eval
system. Writing one here is exactly the boundary violation this file exists to prevent.

## Exit-code mapping

For Shape A, the runner distinguishes three outcomes and the test must preserve all three. Collapsing
them hides the difference between "the product regressed" and "the eval itself is broken".

| Runner exit | Meaning | Test outcome |
| --- | --- | --- |
| `0` | the official run gate passed | pass |
| `1` | the run completed and the gate failed | **test failure**, surfacing the failing row identifiers from the result payload |
| `2` | invalid spec, invalid dataset, holdout leakage, or an I/O error | **test error, never a soft fail** |

Exit `2` is a contract bug in the eval definition, not a quality regression in the product. Route it
to `ai-evals`. Never "fix" it by loosening the test.

## Sketches

Illustrations of the contract, not a framework to copy wholesale.

```python
# tests/evals/test_support_quality.py
import json
import os
import subprocess

import pytest

REQUIRED = ("EVAL_RUNNER", "EVAL_SPEC_PATH", "EVAL_DATASET_PATH", "EVAL_SUITE_ID")


@pytest.mark.evals
@pytest.mark.slow
def test_build_passes_the_owned_suite(tmp_path):
    if any(os.environ.get(name) is None for name in REQUIRED):
        pytest.skip("eval system not configured")

    out = tmp_path / "results.json"
    completed = subprocess.run(
        [
            "python3", os.environ["EVAL_RUNNER"],
            "--spec", os.environ["EVAL_SPEC_PATH"],
            "--dataset", os.environ["EVAL_DATASET_PATH"],
            "--out", str(out),
        ],
        capture_output=True,
        text=True,
    )

    # Exit 2 is a broken eval definition, not a product regression. Route it, do not absorb it.
    if completed.returncode == 2:
        raise RuntimeError(f"eval contract error, route to ai-evals: {completed.stderr}")

    result = json.loads(out.read_text())
    assert result["eval_id"] == os.environ["EVAL_SUITE_ID"]
    assert result["run_gate"]["passed"] is True, result["run_gate"]
```

```typescript
// tests/evals/support-quality.eval.test.ts
import { describe, expect, it } from 'vitest';

const suiteId = process.env.EVAL_SUITE_ID;
const serviceUrl = process.env.EVAL_SERVICE_URL;

describe.skipIf(!suiteId || !serviceUrl)('owned eval suite', () => {
  it('passes the official gate', async () => {
    const res = await fetch(`${serviceUrl}/runs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.EVAL_SERVICE_TOKEN}` },
      body: JSON.stringify({ suite_id: suiteId, suite_version: process.env.EVAL_SUITE_VERSION }),
    });
    if (res.status >= 500) throw new Error('eval service error, route to ai-evals');

    const result = await res.json();
    expect(result.eval_id).toBe(suiteId);
    expect(result.run_gate.passed).toBe(true);
  });
});
```

## Boundary to ai-evals

The result payload shape, the spec fields, the operation vocabulary, and the dataset split semantics
are all defined in
[`../../ai-evals/references/offline-runner-contract.md`](../../ai-evals/references/offline-runner-contract.md).
Read them there. **Do not restate them here or in a test file** — a copy is a fork waiting to
happen, which is the same defect this contract exists to prevent.

When the suite itself must change — a new dataset row, a different grader, a moved threshold — that
is `ai-evals` work. Nothing about it belongs in `tests/evals/`.

Deterministic application logic around the model — prompt builders, parsers, schema validators,
retrieval filters, tool-call shapes — is **not** an eval. It belongs in `tests/unit/` and
`tests/integration/` like any other code.

## Anti-patterns

- A dataset inlined in the test file.
- A threshold or pass-rate minimum chosen locally.
- Asserting on model output text rather than on the returned gate.
- A retry-until-green loop around a flaky eval.
- Running the eval suite on every pull request.
- Committing eval outputs as fixtures, so the test asserts against last week's answers.
- Importing a grader, a rubric, or a scoring helper into the test.
- Opening a database connection under `tests/evals/`.
- Falling back to a local approximation when the eval system is unconfigured, instead of skipping.
- Catching exit code `2` and treating it as a normal failure, hiding a broken eval definition.
