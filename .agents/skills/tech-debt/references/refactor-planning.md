# Refactor Planning

External owner boundary:

- Use `codebase-design` for module/interface/seam/depth vocabulary.
- Use `improve-codebase-architecture` to scan for deepening opportunities and produce visual candidates.
- Use `grilling` or `grill-with-docs` to interview through unresolved design decisions.
- Use `tdd` for test-first behavior changes.

This local reference owns refactor scope control and issue/plan handoff. It does not duplicate the external architecture or interview methodology.

## Planning flow

1. **Gather the problem.** Capture the current pain, desired end state, trigger for doing it now, and any constraints.
2. **Verify in code.** Locate the relevant modules, callers, contracts, tests, and deployment paths. Treat source files as authoritative.
3. **Choose the owner lens.** Chain to `codebase-design`, `improve-codebase-architecture`, or `grilling` when the hard part is interface shape or architecture.
4. **Define scope.** Write what is in scope, out of scope, and explicitly deferred.
5. **Check coverage.** If behavior is not protected, chain to `tdd` before restructuring.
6. **Break into safe steps.** Each step must leave the repo buildable and reviewable.

## Commit planning rules

- Separate behavior changes from refactors.
- Add characterization or regression tests before risky moves.
- Prefer moves, renames, and extraction commits that can be reviewed independently.
- Keep generated or mechanical churn separate from semantic changes.
- Stop if a step requires an unresolved product or architecture decision.

## GitHub issue body

When filing a refactor issue, include:

- problem statement
- chosen solution
- ordered commit plan
- key decisions
- testing decisions
- out-of-scope items
- risks and rollback notes

Do not put brittle implementation trivia in the issue when it is likely to drift before execution.
