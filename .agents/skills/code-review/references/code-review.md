# Code Review Reference

External owner boundary:

- Use `deslop` for AI-generated code slop, unnecessary comments, abnormal defensive checks, `any` casts, and local style cleanup.
- Use `thermo-nuclear-code-quality-review` for strict maintainability, abstraction quality, file-size, spaghetti growth, and structural simplification review.
- Use `improve` when the output should be a read-only advisor audit with execution-ready plans for another agent.
- Use `no-mistakes` for explicit gate, ship, push, PR, or validate flows.

This local reference owns target selection, review output shape, and productivity handoff. It does not duplicate the external review methodologies.

## Target selection

| Target | Action |
| --- | --- |
| Remote PR number or URL | Checkout/read the PR, PR description, existing comments, and changed files. |
| Local changes | Inspect `git status`, `git diff`, and `git diff --staged`. |
| Named files | Review only the named paths unless imports/callers are needed to verify impact. |

For substantial reviews, identify the intended base branch before judging the diff.

## Review order

1. Recover the human intent behind the change.
2. Check correctness, security, data integrity, and public contract impact.
3. Chain to the external owner skill that matches the review depth:
   - `deslop` for cleanup
   - `thermo-nuclear-code-quality-review` for structural code quality
   - `improve` for broad read-only planning
   - `no-mistakes` for ship/push validation
4. Verify claims with source evidence rather than author summaries.
5. Lead the final response with actionable findings.

## Output contract

Lead with findings ordered by severity. Each finding includes:

- severity
- file and line reference
- what is wrong
- why it matters
- concrete remediation

Use these severities:

- `critical`: blocks merge; security, crashes, data corruption, irreversible rollout risk
- `important`: fix before merge; correctness bugs, missing regression coverage, performance regressions
- `minor`: worthwhile but non-blocking; clarity, local maintainability, small cleanup
- `question`: missing context that changes the review decision

If no issues are found, say that clearly and name any remaining test or runtime gaps.

## Local questions to ask

- What problem is this diff meant to solve?
- Does it alter a public field, route, payload, event, URL, schema, CLI flag, or environment variable?
- What happens on retry, duplicate execution, empty input, denied permission, timeout, and partial failure?
- Which tests prove the behavior that changed?
- Is there a migration, rollout, or docs implication?

For maintainability questions like shallow modules, spaghetti branching, over-broad helpers, or file bloat, chain to `thermo-nuclear-code-quality-review`.

## Pushback rule

Push back with evidence, not tone. When a review comment appears wrong:

1. Restate the suggestion.
2. State what source files or tests were checked.
3. Explain the conflict or cost.
4. Offer the smallest safe alternative or ask the decisive question.

Do not use performative agreement. Use technical acknowledgments such as:

- `Fixed. The issue was X; changed Y to Z.`
- `Verified. This would break Z because of X. I took the safe path instead.`
- `Need clarification on item 3 before implementing the rest.`

## Large diffs

For large PRs, review the runtime-critical path first:

- entrypoints before helpers
- tests and migration files before generated artifacts
- public contracts before internal cleanup
- security and data integrity before style

If the diff is too large to review honestly, request a split or use `improve` to produce a staged plan.
