# Verification Reference

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

If you have not run the command that proves the claim in the current work cycle, you cannot honestly make the claim.

**Violating the letter of this rule is violating the spirit of this rule.**

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |
| CI is fixed | The failing job or equivalent local command now passes | Pushed and assumed |
| Review issue addressed | Changed behavior verified | Only code edited |

## Red Flags — STOP

Stop immediately if you notice any of these:

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without running verification
- Trusting agent success reports without independent check
- Relying on partial verification ("linter passed" ≠ tests pass)
- Thinking "just this once"
- Tired and wanting the work to be over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler ≠ tests |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |
| "I'm tired" | Exhaustion ≠ excuse |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] → "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write test → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**
```
✅ [Run build] [See: exit 0] → "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report without independent check
```

## Partial Verification

If you could not run the decisive proof:
- say that directly
- state what you did verify
- state what remains unverified
- name the next command the user or CI should run

Do not replace missing verification with confidence language like "should", "probably", or "looks good".

## When To Apply

**ALWAYS before:**
- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases and their paraphrases
- Implications of success
- ANY communication suggesting completion/correctness

## Pre-commit Verification Workflow

Run this before committing, opening a PR, or claiming a change is ready.

**Step 1 — Sequential fast gates (stop on first failure):**

1. Format: run the project's formatter (e.g., `yarn prettier`, `npm run format`, `black .`, `gofmt`)
2. Lint: run the linter on changed files (e.g., `yarn linc`, `npm run lint`, `ruff check`)

These are cheap and fast. If either fails, stop and fix before proceeding.

**Step 2 — Parallel slow gates (run concurrently, stop if any fail):**

1. Type check (e.g., `yarn flow`, `tsc --noEmit`, `mypy`)
2. Unit / integration tests for changed source (e.g., `/test`, `yarn test --changed`)
3. Tests for any secondary surface changed (e.g., `/test www`, `yarn test:e2e`)

**Reporting:**

- All gates pass → show a concise success summary listing each gate and its result.
- Any gate fails → stop immediately, name the failed gate, show the error, and suggest a concrete fix.

**Adapting to the repo:**

Discover the actual commands from `package.json` scripts, `Makefile`, `pyproject.toml`, `justfile`, or CI config rather than assuming defaults. The pattern (format → lint → parallel type+test) is constant; the commands vary by stack.

**Common mistakes with yarn prettier / yarn linc:**

- `yarn prettier` only formats changed files — do not expect it to reformat the entire codebase.
- `yarn linc` errors are not warnings — they will fail CI. Fix all of them before committing.

## Why This Matters

Claiming work is complete without verification is dishonesty, not efficiency. Skipping verification has caused:

- Trust broken: "I don't believe you" — the human partner lost confidence in reported status.
- Undefined functions shipped — would crash in production.
- Missing requirements shipped — incomplete features delivered as complete.
- Time wasted on false completion → redirect → rework cycles.

**The bottom line:** run the command, read the output, then claim the result. No shortcuts.
