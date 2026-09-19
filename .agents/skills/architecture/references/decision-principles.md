# Decision Principles

Use these principles to auto-decide intermediate choices during autonomous loops.
They reduce unnecessary pauses and keep agents moving without sacrificing correctness.

## Clarification as the Default Interaction Model

**User clarification is the default for strategic decisions.** Agents guess at 30% of the decisions in any non-trivial request, and those assumptions are exactly where quality falls flat. The goal is a hybrid model:

| Situation | Action |
|-----------|--------|
| An existing pattern applies cleanly | Apply it silently (mechanical) |
| Pattern exists but improvement is available | Apply it, surface the improvement as [TASTE] at the gate |
| No pattern, two viable approaches | Recommend one with a reason; ask for confirmation |
| User's direction conflicts with analysis | Never auto-override; surface as [USER CHALLENGE] |
| Strategic decision with open constraints | Ask before building — expand the spec, then interview for gaps |

**The interviewer model:** for any creation task (feature, system, content, design) where key constraints are still ambiguous, do not guess toward the middle. Expand the request into a full spec, surface unresolved decisions with proposed answers, and resolve them before producing output. See [interviewer-pattern.md](./interviewer-pattern.md).

**Hybrid decisions are the default:** apply the clearest pattern silently and ask about the part that genuinely needs judgment — not the whole thing, and not nothing.

**Exception — framework and technology choices are always `[USER CHALLENGE]`.** Never auto-decide the technology stack, runtime, database engine, or primary framework. These decisions compound: they dictate every downstream pattern. If the user's existing stack is established, apply it and surface improvements as `[TASTE]`. If the stack is genuinely open, present options and wait for the user's direction before any implementation begins.

## The 6 Principles

1. **Choose completeness** — ship the whole thing. Pick the approach that covers more
   edge cases. AI makes thoroughness cheap; partial fixes create debt.

2. **Boil the lake** — fix everything in the blast radius (modified files + direct importers).
   Auto-approve expansions that are in blast radius AND under one day of effort (< 5 files,
   no new infra, no new dependencies).

3. **Pragmatic** — if two options fix the same problem, pick the cleaner one. Spend
   5 seconds choosing, not 5 minutes deliberating.

4. **DRY** — if it duplicates existing functionality, reject it. Reuse what already exists.

5. **Explicit over clever** — a 10-line obvious fix beats a 200-line abstraction. Prefer
   what a new contributor reads in 30 seconds over what impresses in a code review.

6. **Bias toward action** — merge over review cycles over stale deliberation. Flag
   concerns, but do not block on them.

## Conflict Resolution (phase-aware)

Different phases prioritize different principles:

| Phase | Dominant principles |
|---|---|
| Planning / scope | Completeness + Boil the lake |
| Implementation | Explicit + Pragmatic |
| Review / polish | Explicit + Completeness |
| Release | Bias toward action + Pragmatic |

## Decision Classification

Every decision in an autonomous loop falls into one of three classes. The class determines who decides.

**Mechanical** — one clearly right answer. Auto-decide silently. Examples: run evals (always), apply lint fix (if lint passes after), reduce scope on an already-complete plan (always no), use the existing pattern over a new abstraction (DRY applies).

**Taste** — reasonable people could disagree. Auto-decide using the 6 principles above, but surface the decision at the final approval gate rather than hiding it. Three natural sources:
- *Close approaches* — top two options are both viable with different tradeoffs.
- *Borderline scope* — in blast radius but 3–5 files, or the radius is ambiguous.
- *Conflicting recommendations* — tooling or a second analysis recommends differently and has a valid point.

Format for taste decisions surfaced at gate:
```
[TASTE] Decision: <one-line question>
Auto-decided: <option chosen> | Principle: <which of the 6>
Alternative: <option not taken> — <one-line tradeoff>
```

**User Challenge** — both models (or two passes of analysis) agree the user's stated direction should change. **Never auto-decide.** The user has context models lack. Surface it as:
```
[USER CHALLENGE] What you said: <original direction>
What analysis recommends: <the change>
Why: <reasoning>
Context we may be missing: <explicit blind spot acknowledgment>
If we're wrong, the cost is: <consequence of incorrect override>
```
The user's original direction is the default. Analysis must make the case for change, not the reverse.

**Exception for security/feasibility**: if both passes flag the issue as a vulnerability or blocker (not a preference), label it `[SECURITY CHALLENGE]` or `[FEASIBILITY CHALLENGE]` but still let the user decide.

## When to Override and Ask

Use these principles to auto-decide *within* a loop, not to bypass human judgment on:

- Destructive operations (deletes, migrations, auth changes, infra)
- Scope expansions beyond 5 files or requiring new infrastructure
- Security-sensitive changes
- Ambiguity in the product requirement itself

When in doubt: report `NEEDS_CONTEXT` and name exactly what information is missing.

## Structured Decision Brief

When a choice requires human input, surface it as a structured brief:

```
Decision: <one-line question>
Context: <one sentence grounding the current task>
Stakes: <what breaks or is lost if the wrong choice is made>
Recommendation: <option> because <one-line reason>
Options:
A) <option> — ✅ <pro> ❌ <con>
B) <option> — ✅ <pro> ❌ <con>
Net: <one-line synthesis of the actual tradeoff>
```

Keep it minimal: one recommendation, one reason, two options, one net line.

Include a completeness score only when options differ in coverage: `Completeness: A=8/10, B=5/10`
(10 = all edge cases, 7 = happy path, 3 = shortcut). If options differ in kind, not coverage,
skip the score and write: `Note: options differ in kind — no coverage comparison.`

## Search Before Building

Before building anything unfamiliar, search first. Work through the layers:

1. **Layer 1 — standard library / well-known pattern**: do not reinvent.
2. **Layer 2 — new or popular library**: scrutinize before adopting. Check maintenance
   health, bundle/binary size, and alignment with the existing stack.
3. **Layer 3 — first principles**: reason from scratch only when Layer 1 and 2 don't fit.
   This is the highest-value work — name it explicitly when you do it.

When first-principles reasoning contradicts conventional wisdom, name it and record the
insight in the repo's lessons file (`docs/lessons/` or equivalent).
