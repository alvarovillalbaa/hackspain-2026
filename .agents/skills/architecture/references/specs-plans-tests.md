# Specs, Plans, Tests, and Progress

External owner boundary:

- Use `tdd` for red-green-refactor, tracer bullets, public-interface behavior tests, mocking discipline, and TDD workflow.
- Use `codebase-design` for interface, seam, adapter, depth, locality, and testability vocabulary.
- Use this file only for local artifact boundaries: specs, plans, progress files, and task contracts.

## Definitions

- A `spec` defines what must be true when the work is done: behavior, constraints, acceptance criteria, invariants, and non-goals.
- A `plan` defines how to get there: ordered steps, likely files, risks, checkpoints, and verification commands.
- A `progress file` records loop state across iterations: done items, failed attempts, and the next highest-priority slice.
- A `test` proves behavior. For the test-first workflow, chain to `tdd`.
- A `task contract` defines done-ness for one session or iteration with explicit checks and observable outcomes.

Do not collapse these into one document. They solve different coordination problems.

Specs are product-focused contracts, not technical design docs. They may be manually written or derived from external product systems, but they should stay centered on user outcomes, scope, acceptance, constraints, and proof. Include only small technical hints when they prevent an obvious implementation mistake.

## Structured spec shape

The exact template can vary by repo, but a harness-friendly spec should make done-ness and proof explicit:

```yaml
---
title:
scope:
acceptance_criteria:
test_requirements:
constraints:
non_goals:
risks:
---
```

Use the body for behavior details, examples, links, and open decisions.

## When to use each

Write or refine a spec when:

- behavior is unclear
- multiple product interpretations are valid
- success criteria are missing
- several engineers or agents need a shared contract

Write a plan when:

- the user explicitly asks for a plan
- execution order matters
- several agents or sessions must coordinate
- the repo requires planning before implementation

Use external `tdd` when:

- fixing a bug with a reproducible symptom
- changing business logic, parsing, payload-shape behavior, policy code, or public behavior
- the user asks for test-first work or integration tests

Keep a progress file when:

- work spans multiple sessions or repeated agent iterations
- several slices share one spec but should not share one huge transcript
- a reviewer needs to see what remains without rereading chat history

## Planning mode vs building mode

Keep planning and building separate when the work is large enough to need iteration.

- Planning mode updates only the spec, plan, or progress artifact.
- Building mode executes one highest-priority task from that artifact, proves it, and writes back the result.

Do not half-plan and half-build across a large surface in one pass.

## Harness-friendly task slices

A good slice has:

- one primary goal
- one clear owner or change surface
- one proof path
- a size that fits one focused iteration

If a slice cannot be explained and verified compactly, split it before dispatching agents.

## A sufficiently detailed spec is code

Use specs for `what`, not `how`.

Warning signs that a spec has become implementation code:

- field-by-field pseudo-schemas where a real type should exist
- reference algorithms that leave no design choice
- file paths and function signatures that will drift before execution
- step lists masquerading as acceptance criteria

When a spec reads like pseudocode, validate the desired behavior first. Then either write the code or turn the document back into acceptance criteria.

## Task contracts

A task contract makes done-ness unambiguous for one session or loop iteration.

```markdown
# {Feature} Contract

## Must be true before this task is complete

### Tests
- [ ] `<test command>` passes with no failures
- [ ] No tests are skipped or pending

### Behavior
- [ ] <specific observable behavior 1>
- [ ] <specific observable behavior 2>
- [ ] Error case: <expected response to X input>

### Verification
- [ ] Screenshot, trace, log, or command output proves <key flow>

## Out of scope
- <deferred item 1>
- <deferred item 2>
```

Contracts outperform open-ended task descriptions because they convert "done" into a mechanical checklist. When a stop hook is wired, the contract is binding rather than advisory.

## Plan completion audit

When a plan file drove implementation, compare every actionable plan item against the diff before shipping.

Classify each item:

- `DONE`: clear source evidence shows the item was implemented
- `PARTIAL`: some work exists but is incomplete
- `NOT DONE`: no evidence in the diff
- `CHANGED`: the same goal was achieved by a different approach

Gate:

- all `DONE` or `CHANGED`: pass
- only `PARTIAL`: document the residual risk
- any `NOT DONE`: stop, implement, defer explicitly, or mark intentionally dropped

## Repo policy overrides

Always respect local policy for planning and tests. Some repos want plans only on explicit request. Some repos do not want tests run automatically. State what you verified and what you intentionally did not run.
