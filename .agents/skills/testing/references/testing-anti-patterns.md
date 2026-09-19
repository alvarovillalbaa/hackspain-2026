# Testing Anti-Patterns

External owner boundary:

- Use `tdd` for public-interface behavior testing, red-green-refactor, and mocking discipline.
- This file keeps a compact local rejection list for QA review.

Reject these patterns:

- import-only tests that prove only that a file loads
- assertions against mock existence instead of observable behavior
- test-only methods added to production classes
- deep mocks that replace the logic under test
- snapshot tests used as a substitute for behavioral assertions
- `sleep()` in tests instead of explicit waits or deterministic execution
- shared mutable state between tests
- fixtures that hide the condition the test depends on
- no regression test or repeatable proof for a bug fix
- running only a focused test, then claiming the broader area is safe

Replacement moves:

- assert observable outcomes
- move to the test layer that can prove the claim
- freeze time or seed randomness
- use real factories for persistence behavior
- publish failure artifacts for CI and browser tests
- chain to `tdd` when the issue is test design rather than framework mechanics
