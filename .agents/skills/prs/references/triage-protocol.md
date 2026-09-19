# PR Triage Protocol

Intent-first triage for PR queues. Process each item independently. Do not let one item's framing leak into another.

## Step 1 — Recover the plain-language intent

Before touching the diff, answer one question in plain language: **what is this PR actually trying to do for a human?**

Read the code, diff, PR description, linked issue, and surrounding context. Translate jargon into purpose. If the description sounds model-generated or overly technical, recover the real goal underneath it. Write the intention as one human talking to another.

If the intent cannot be recovered confidently, treat the PR as unclear and close it. An unclear PR is as bad as a wrong-shaped fix.

## Step 2 — Judge whether the implementation solves the real problem

Once you have the intent, evaluate the implementation against it:

- Does this fix the underlying cause, or only a local symptom?
- Is this a durable solution or a band-aid?
- Is the PR adding extra behavior or special-case logic beyond what the intent requires?

Do not stop at "does the diff compile" or "does it match the ticket." A PR that compiles but does not address the real problem is a flow failure.

## Step 3 — Close, escalate, or continue

### Close the PR if any of these are true

- The intent is unclear, conflicting, or too poorly framed to evaluate
- The implementation is wrong-shaped for the problem
- The fix is too local or too narrow — it treats a symptom rather than the root cause
- The PR is a band-aid or shortcut that avoids the real issue
- The current implementation should be rejected rather than iterated on

Post a comment explaining: the recovered intent, why the implementation does not solve the right problem, and what reframing would be needed.

### Escalate to a human if any of these are true

- The right answer requires reframing the problem, changing product behavior, or making an architectural call
- A fundamental refactor is needed before the implementation can proceed
- A human must decide the product or architecture direction before any code can be judged

Post a comment with: intent, why human judgment is needed, the exact decision or reframing required.

### Continue autonomously if

- Intent is clear and the implementation serves it in a real way
- Refactor needed is none or only superficial (add/remove/reshape small things without changing the core framing)
- Validation path is clear

## Step 4 — Check for conflicts against current base

After judging intent and solution, update against the current base and check conflict status:

- **Clean**: continue
- **Clear resolution path**: resolve autonomously, then continue
- **Ambiguous or judgment-heavy**: escalate — do not resolve blindly

## Step 5 — Choose the validation path

Decide: is this a bug fix or a feature/behavior change?

**Bug path:**
- Reproduce the failure with the smallest credible test
- Temporarily ablate the fix (local only — never commit, never push) to confirm the test fails on the broken state
- Restore the fix and rerun to confirm the test now passes
- If the bug cannot be reproduced, or the fix does not change the outcome, escalate

**Feature path:**
- Run the smallest credible check that shows the feature works as intended
- For maintenance, tooling, and docs-only PRs: decide whether bespoke local testing is needed or whether normal CI is sufficient
- If the feature cannot be validated confidently, escalate

## Step 6 — Apply superficial cleanup before review

If the PR is directionally correct but messy, do superficial cleanup before proceeding to review:

- Remove unnecessary local complexity
- Tighten names and ownership signals
- Reduce special cases that are not essential
- Keep changes minimal and readable

If cleanup requires a fundamental reframe, escalate instead of polishing around the edges.

## Step 7 — Run review in a fixed order

For items on the autonomous lane:

1. Check existing review comments (on GitHub or equivalent) and address valid unresolved ones first
2. Refresh the base branch from origin, determine the correct merge base
3. Run a fresh local review against that fresh base ref
4. Treat P0 and P1 findings as merge blockers — address and re-run until cleared
5. P2 and lower are not blockers by default — use judgment

If the review cannot complete reliably, escalate rather than pretending it is clear.

## Step 8 — Verify CI

- If CI is green, satisfied
- If CI is failing: determine whether failures are actually caused by this PR
  - Pre-existing or clearly unrelated failures: document and do not treat as blockers
  - Plausibly related failures: must fix before landing
- After fixing CI failures, re-run the validation from Step 5
- Re-check CI until related failures are gone

## Step 9 — Check for new conflicts before landing

After review and CI are clear, check conflicts again. The base may have moved. If new conflicts appeared, assess them:

- Clear resolution path: resolve and re-run CI check
- Needs human judgment: escalate

## Landing gates

A PR is ready to land only if **all** of these are true:

- [ ] Plain-language intent is clear
- [ ] Implementation serves that intent in a real way (not symptom-only)
- [ ] Branch applies cleanly to current base, or conflicts were resolved and revalidated
- [ ] Bug was reproduced and shown fixed, or feature was tested directly
- [ ] No fundamental refactor needed
- [ ] No human framing or architectural judgment still required
- [ ] Review ran against fresh base with no unresolved P0 or P1 findings
- [ ] CI is green, or remaining failures are clearly unrelated to the PR

## Comment template

Use this when posting results. Keep it short and scannable.

```
**Intent:** [plain-language goal]
**Solution judgment:** [solves the real problem / symptom-only / unclear]
**Conflicts:** [clean / resolved / escalated]
**Validation:** [bug reproduced and fixed / feature tested / could not validate]
**Refactor needed:** [none / superficial / fundamental]
**Review:** [clear / P0-P1 findings addressed / blocked]
**CI:** [green / unrelated failures only / related failures present]

**Outcome:** [✅ ready for landing / ⚠️ needs judgment: <what decision is needed> / ❌ closing: <reason>]
```
