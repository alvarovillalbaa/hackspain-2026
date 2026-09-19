# Verification and Finish

Do not claim success without evidence. If you did not run the command that proves the claim, say what you did verify and what remains unverified.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not run the verification command in this message, you cannot claim it passes. "Should work", "seems right", or "probably passes" are not verification. Evidence is.

### The Gate Function

Before claiming any status (done, fixed, passing, complete):

1. **Identify** — what command proves this claim?
2. **Run** — execute the full command fresh (not from a previous turn)
3. **Read** — check the full output and exit code
4. **Verify** — does output actually confirm the claim? If no: state actual status with evidence. If yes: state claim WITH evidence.
5. **Only then** — make the claim

Skipping any step means the claim is a guess, not a verification.

### Common Claim/Evidence Pairs

| Claim | Required evidence | Not sufficient |
|-------|-------------------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

### Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ build |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |

### Red Flags — STOP before claiming complete

- Using "should", "probably", "seems to", "looks like"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- About to commit or open a PR without running tests
- Trusting an agent's self-reported success
- Relying on a check from a previous turn

## Binary Gates

If a gate is allowed to block or advance work, it must be binary pass or fail.

- lint, typecheck, test, build, schema, or review gates cannot be treated as “close enough”
- warn-only output can inform a human, but it cannot justify “ready” in a looped or autonomous flow
- if a repo lacks a single local verify command, chain the minimum relevant commands explicitly

Weak or noisy gates cause false green results. Do not hide that.

## Verification Ladder

Use the narrowest checks that prove the current claim:

1. reproduce the bug or failing behavior
2. run the focused test, lint, build, or manual scenario that proves the fix
3. inspect the diff for unintended spillover
4. inspect `git status` before finishing

If the change touched shared infrastructure, core types, public APIs, or other high-fanout seams, run the next broader relevant check before declaring completion.

## Verification Output Hygiene

Prefer output that is useful for decisions:

- use quiet or focused flags when available
- prefer failure-first output over pages of passing logs
- keep screenshots, traces, and manual test notes tied to the exact acceptance criterion they prove

If the repo or user says not to run tests automatically, respect that and state it plainly.

## Before Declaring Completion

- re-read the user request
- confirm each acceptance criterion
- state the verification evidence
- call out anything you could not run
- mention any remaining risk or follow-up

## Finishing a Branch or Worktree

**Step 1: Verify tests pass.** Do not present completion options until tests pass. Show failures and stop if they don't.

**Step 2: Detect workspace state** before presenting options:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

| State | Options | Cleanup |
|-------|---------|---------|
| Normal repo (`GIT_DIR == GIT_COMMON`) | All 4 options | No worktree cleanup |
| Named-branch worktree (`GIT_DIR != GIT_COMMON`, has branch) | All 4 options | Remove worktree after merge/discard |
| Detached HEAD worktree | Options 2–4 only (no local merge) | Externally managed — do not clean up |

**Step 3: Present options explicitly:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work
```

Require explicit confirmation before destructive cleanup (options 1 and 4). Remove a worktree only when the chosen option makes cleanup safe and intentional — never speculatively.

## Finishing on `main`

If the user kept you on `main`, do not commit or push unless they asked. Summarize the diff, the evidence, and the current git state so the next action is explicit.

## Use the Hook

When the `agent-harness` skill is active in Claude, its skill-scoped `Stop`
hook runs `scripts/completion-gate.py`. A different runtime may invoke that
handler only when it supplies the same JSON event contract. The hook catches
the classic failure mode: stopping after partial implementation, stale
verification, or unfinished integration work.
