# Code Simplification

Use this reference for behavior-preserving simplification. Route generated-code residue to external `deslop`, broad debt programs to `tech-debt`, and architecture redesign to the appropriate architecture owner.

## Scope

Resolve scope in this order:

1. User-named file, directory, function, or diff.
2. Branch diff against the configured upstream or default branch.
3. Most recently modified files mentioned in the conversation.

If the scope is empty, infer it from the active request and changed paths when safe; ask only when multiple materially different scopes remain plausible.

## Local simplification rules

- Preserve behavior unless fixing a proven bug.
- Prefer deleting duplicate or unused code over adding abstraction.
- Prefer existing canonical helpers over near-duplicates.
- Keep commits and verification scoped to the simplification target.
- Record any skipped finding with the evidence that made it a false positive.

## Simplification checklist

- Remove unused imports, variables, functions, branches, wrappers, and stale compatibility paths.
- Consolidate repeated behavior under one existing or clearly canonical owner.
- Prefer guard clauses and direct data flow over deep nesting and indirect state changes.
- Use existing project helpers, standard-library features, and framework primitives before adding custom infrastructure.
- Keep abstractions only when they enforce a real contract, isolate volatility, or materially improve testability.
- Prefer explicit, readable code over terse or clever code.
- Preserve validation, permissions, error semantics, accessibility, logging, and public contracts.

## Review output

Report the scoped findings, the code removed or consolidated, the proof used to preserve behavior, and any risk that was not evaluated. Do not use raw line-count reduction as the success metric.

## Verification

After simplification:

1. Run typecheck and lint when available.
2. Run focused tests for changed paths.
3. Broaden tests if the changed module is shared.
4. If no verification command exists, say so explicitly.

Never relax assertions, weaken types, or skip tests to make a simplification pass.
