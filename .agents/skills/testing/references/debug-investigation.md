# Debug Investigation

Use this reference when systematically finding root causes for bugs, errors, test failures, or broken behavior. The goal is to trace the full causal chain before proposing any fix.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1 (Investigate), you cannot propose fixes. "Quick fix for now" is not debugging — it is symptom management that leaves the real cause active.

## Core Principles

1. **Investigate before fixing.** Do not propose a fix until you can explain the full causal chain from trigger to symptom with no gaps. "Somehow X leads to Y" is a gap.
2. **Predictions for uncertain links.** When the causal chain has an uncertain step, form a prediction — something in a different code path that must also be true if the link is correct. If the prediction is wrong but a fix "works," you found a symptom, not the cause.
3. **One change at a time.** Test one hypothesis, change one thing. Changing multiple things to "see if it helps" is shotgun debugging.
4. **When stuck, diagnose why — don't just try harder.**

### Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Quick fix for now, investigate later" | Root cause is still active — symptom returns |
| "This should work" | Untested prediction is not evidence |
| "Let me just try..." | A hypothesis is required before each attempt |
| "One more attempt" | Same approach that failed once fails again — something must change |
| "We're under time pressure" | Systematic debugging is faster than thrashing |
| "It seems obviously X" | Simple bugs have root causes too |
| "Fix already applied, moved on" | If root cause is unclear, the fix is unstable |

## Workflow

| Phase | Name | Purpose |
|-------|------|---------|
| 0 | Triage | Parse input, fetch issue if referenced, establish problem statement |
| 1 | Investigate | Reproduce the bug, verify environment, trace the code path |
| 2 | Root Cause | Form hypotheses, test predictions, verify causal chain |
| 3 | Fix | Test-first fix with workspace safety checks |
| 4 | Handoff | Structured summary, follow-up options |

---

## Phase 0: Triage

Parse the input and reach a clear problem statement before doing anything else.

**If the input references an issue tracker** (`#123`, GitHub URL, Linear ID, Jira key):
- GitHub: `gh issue view <number> --json title,body,comments,labels`
- Other trackers: use available MCP tools or fetch the URL. If that fails, ask the user to paste the thread.
- Read the **full comment thread** — the opening description is often superseded by later comments with updated reproduction steps, narrowed scope, or prior failed attempts.

**Everything else** (stack traces, error messages, test paths, descriptions): the problem statement is the input itself.

**Trivial-bug fast-path:** If the cause is immediately readable from the input (single-file typo, missing import, obvious null deref with a one-line fix), present the cause and proposed fix before editing. Ask whether to apply it or stop at diagnosis. If applying: do a workspace safety check (uncommitted work, default branch), apply, leave a one-line cause note, proceed to Phase 4 summary.

**Prior-attempt awareness:** If the user indicates prior failed attempts, ask what they've already tried before investigating. Avoid repeating failed approaches.

---

## Phase 1: Investigate

### 1.1 Reproduce the bug

Confirm the bug exists before tracing. Run the test, trigger the error, follow reported steps.

- **Does not reproduce after 2–3 attempts:** the bug may be intermittent — look for timing dependencies, concurrency, or environment differences.
- **Cannot reproduce at all:** document what was tried and what conditions appear missing. Ask the user for the environment delta before proceeding.
- **Reproduction test:** if the project has a testing style guide or AGENTS.md testing section, follow it. Otherwise write a minimal failing test that names the expected behavior in its description.

### 1.2 Verify environment sanity

Before deep code tracing, confirm the environment is what you expect:

- Correct branch, no unintended uncommitted changes
- Dependencies installed and current (stale `node_modules`/`vendor` is a common false lead)
- Expected interpreter or runtime version (`.tool-versions`, `.nvmrc`, `Gemfile`)
- Required env vars present and non-empty
- No stale build artifacts (`dist/`, `.next/`, compiled binaries from an earlier branch)
- Dependent services running at expected versions when the bug plausibly involves them

### 1.3 Trace the code path

Trace data flow backward from the symptom to where valid state first became invalid. Read code to form a hypothesis, then verify with observed values — do not theorize from code alone.

Concrete recipe:

1. Read the stack trace bottom-to-top, opening each frame's source. The bottom frame is the symptom; the root cause is upstream.
2. Identify the first frame where the input data is already invalid — that bounds where to look.
3. Instrument boundaries: targeted log/print statements, debugger breakpoints, or test assertions that capture actual values at function entry/exit. Assumed values lie; observed values don't.
4. Walk boundaries until valid input becomes invalid output. That transition is the root cause site.

Do not stop at the first function that looks wrong — the root cause is where bad state originates, not where it's first observed.

As you trace:
- Check recent changes: `git log --oneline -10 -- [file]`
- If the bug looks like a regression, use `git bisect` to pinpoint the introducing commit
- Check observability signals: error trackers, application logs, browser console, database state

---

## Phase 2: Root Cause

**Assumption audit (before hypothesis formation):** List every "this must be true" belief your understanding depends on — the framework behaves as expected, this function returns what its name implies, config loads before this runs, the caller passes non-null. For each, mark *verified* (you read the code, checked state, or ran it) or *assumed*. Unverified assumptions are the most common cause of wrong hypotheses.

**Avoid these anti-patterns:**
- "Quick fix for now, investigate later"
- "This should work" (without a tested prediction)
- "Let me just try..." (without a hypothesis)
- "One more attempt" after a failed fix on the same hypothesis

**Form hypotheses** ranked by likelihood. For each:
- What is wrong and where (file:line)
- At least one concrete observation that supports it (runtime variable value, log line, instrumented boundary capture, behavior delta)
- The causal chain: how the trigger leads to the observed symptom, step by step
- For uncertain links: a prediction — something in a different code path that must also be true if this link is correct

**Causal chain gate:** Do not proceed to Phase 3 until you can explain the full causal chain from trigger through every step to the observed symptom with no gaps. If investigation is stuck after genuine effort, the user can authorize proceeding with the best-available hypothesis.

**If a prediction is wrong but the fix appears to work:** you found a symptom, not the root cause. The real cause is still active.

### Present findings

Once the root cause is confirmed, present:
- Root cause (causal chain summary with file:line references)
- Proposed fix and which files would change
- Which tests to add or modify (specific test file, case description, what the assertion verifies)
- Whether existing tests should have caught this and why they did not

Then ask: **Fix it now** (proceed to Phase 3) or **Diagnosis only** (skip to Phase 4 summary)?

---

## Phase 3: Fix

### Workspace safety check

Before editing:
1. Confirm no uncommitted work that should be stashed or committed first
2. If on the default branch (main/master), create a fix branch before editing
3. Identify which tests will verify the fix — run them first to confirm they're failing

### Test-first fix

1. Write the failing test that encodes the correct behavior (if not already done in reproduction)
2. Apply the minimal fix
3. Run the targeted tests — confirm they pass
4. Run broader regression evidence (full suite or related module)

### Invalidation check

If a prior failed fix attempt exists: confirm the current fix is mechanically different from the failed one, not just a variation. "Fixed" with the same approach that already failed means you've changed a symptom, not the root cause.

**Three-attempt gate:** If this is the third failed fix attempt on the same bug, stop fixing and surface the situation to the user. Three failures signals a wrong diagnosis or an architectural problem — not a fixable detail. Present: what was tried, what was expected, what actually happened, and your current hypothesis about why the approach is wrong. Do not attempt fix 4 without user guidance.

---

## Phase 4: Handoff

Produce a structured summary:

```
## Debug Summary
Root cause: [file:line — one-sentence causal chain]
Fix applied: [what changed, where]
Tests added/updated: [test file, case name]
Existing gap: [why existing tests didn't catch this, or "N/A"]
Residual risks: [any related paths that could exhibit similar behavior]
```

Then offer follow-up options:
- Open a PR / commit
- Add regression test coverage for related paths
- Update documentation or AGENTS.md if this was a recurring footgun

---

## Smart Escalation Table

| Situation | Action |
|-----------|--------|
| Can reproduce but can't trace | Add boundary instrumentation, widen the search window |
| Can't reproduce | Ask for environment delta; try in a clean environment |
| Prediction was wrong | Discard hypothesis, return to Phase 1 with fresh instrumentation |
| Fixed but root cause unclear | Do not claim done — the fix is unstable. Return to Phase 2. |
| Causal chain has a gap after exhaustive tracing | Escalate to user with what is known and what is unknown |
| Same class of bug seen before | Check repo docs (`docs/solutions/`) for prior incident notes |
| **3+ failed fix attempts on the same bug** | **STOP. Do not vary the same approach. The fix strategy or the architecture is wrong — surface this to the user before continuing.** |

---

## Root Cause Tracing: Trace Backward Through the Call Chain

Bugs manifest deep in the stack. Your instinct is to fix where the error appears, but that is treating a symptom. Fix at the source, not at the point of observation.

**The principle:** NEVER fix just where the error appears. Trace backward through the call chain until you find the original trigger.

### Tracing Process

1. **Observe the symptom** — error message, wrong output, failing assertion
2. **Find the immediate cause** — what code directly produces this symptom?
3. **Ask: what called this?** — trace one level up the call chain
4. **Keep tracing** — what value was passed? Where did it come from?
5. **Find the original trigger** — keep going until you reach the source of invalid state

When you cannot trace manually, add instrumentation:

```typescript
async function riskyOperation(directory: string) {
  const stack = new Error().stack;
  console.error('DEBUG:', { directory, cwd: process.cwd(), stack });
  // ... proceed
}
```

Run and capture: `npm test 2>&1 | grep 'DEBUG'`

Look for: test file names, line numbers triggering the call, repeated patterns.

### Finding Test Polluants

If something appears during tests but you cannot identify which test causes it, use the `scripts/find-polluter.sh` bisection script:

```bash
bash scripts/find-polluter.sh '.git' 'src/**/*.test.ts'
```

This runs tests one-by-one and stops at the first test that produces the artifact.

---

## Defense-in-Depth Validation: Validate at Every Layer

After finding the root cause, add validation at every layer data passes through. Single-point validation can be bypassed by different code paths, refactoring, or mocks.

**The principle:** Validate at EVERY layer. Make the bug structurally impossible.

Single validation: "We fixed the bug."
Multiple layers: "We made the bug impossible."

### Four Validation Layers

**Layer 1 — Entry point:** Reject obviously invalid input at API boundary.
```typescript
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory || workingDirectory.trim() === '') {
    throw new Error('workingDirectory cannot be empty');
  }
}
```

**Layer 2 — Business logic:** Ensure data makes sense for this specific operation.
```typescript
function initializeWorkspace(projectDir: string, sessionId: string) {
  if (!projectDir) throw new Error('projectDir required for workspace initialization');
}
```

**Layer 3 — Environment guard:** Prevent dangerous operations in specific contexts.
```typescript
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test') {
    const normalized = path.resolve(directory);
    if (!normalized.startsWith(os.tmpdir())) {
      throw new Error(`Refusing git init outside temp dir during tests: ${directory}`);
    }
  }
}
```

**Layer 4 — Debug instrumentation:** Capture context for forensics when other layers fail.
```typescript
async function gitInit(directory: string) {
  logger.debug('About to git init', { directory, cwd: process.cwd(), stack: new Error().stack });
}
```

All four layers are necessary. Different code paths bypass different checkpoints.

---

## Condition-Based Waiting: Eliminate Flaky Timing Tests

Tests that use `setTimeout` or `sleep` guess at timing. This creates race conditions that pass on fast machines but fail under load or in CI.

**The principle:** Wait for the actual condition you care about, not a guess about how long it takes.

```typescript
// ❌ BEFORE: Guessing at timing
await new Promise(r => setTimeout(r, 50));
const result = getResult();
expect(result).toBeDefined();

// ✅ AFTER: Waiting for condition
await waitFor(() => getResult() !== undefined, 'result to be available');
const result = getResult();
expect(result).toBeDefined();
```

### Generic polling implementation

```typescript
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000
): Promise<T> {
  const startTime = Date.now();
  while (true) {
    const result = condition();
    if (result) return result;
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}
```

### Quick patterns

| Scenario | Pattern |
|----------|---------|
| Wait for event | `waitFor(() => events.find(e => e.type === 'DONE'))` |
| Wait for state | `waitFor(() => machine.state === 'ready')` |
| Wait for count | `waitFor(() => items.length >= 5)` |
| Wait for file | `waitFor(() => fs.existsSync(path))` |

### When arbitrary timeout IS correct

Sometimes you legitimately need to wait for a timed behavior (e.g., a tool that ticks every 100ms). Requirements:
1. First wait for the triggering condition with `waitFor()`
2. Base the delay on a known timing (e.g., "2 ticks at 100ms = 200ms")
3. Add a comment explaining exactly why

```typescript
await waitFor(() => manager.state === 'STARTED', 'manager started');
await new Promise(r => setTimeout(r, 200)); // 2 ticks at 100ms intervals
```
