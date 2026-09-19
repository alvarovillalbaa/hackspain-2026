# QA Anti-Patterns

Use this reference for QA, verification, and CI-specific failure modes. Use external `deslop` for AI-code cleanup and external `thermo-nuclear-code-quality-review` for broad maintainability smells.

Install fallbacks:

```sh
python3 scripts/install-external-skills.py --skill deslop --agent codex
python3 scripts/install-external-skills.py --skill thermo-nuclear-code-quality-review --agent codex
```

## Testing anti-patterns

- import-only tests that prove only that the file loads
- assertions that only prove a mock was called
- snapshots used instead of behavior assertions
- `sleep()` calls instead of deterministic waits
- shared mutable state between tests
- fixtures that hide the condition under test
- bug fixes without regression coverage
- focused-test-only verification followed by broad safety claims

For test-first workflow, public-interface discipline, and mocking rules, chain to external `tdd`.

## Review anti-patterns

- reviewing style that formatters or linters own
- commenting on taste while missing correctness or rollback risk
- leaving vague feedback without evidence or impact
- treating reviewer comments as orders instead of claims to verify
- approving large diffs without tracing the runtime-critical path

For branch-diff cleanup, invoke `deslop`. For harsh structural review, invoke `thermo-nuclear-code-quality-review`.

## Debugging anti-patterns

- fixing the first visible symptom instead of the root cause
- reading only the last line of the stack trace
- changing multiple variables at once
- assuming CI is wrong because local passes
- labeling a failure flaky before isolating order, time, or shared state
- adding logs everywhere instead of starting with existing evidence

## CI/CD anti-patterns

- running different commands in CI than developers run locally
- hiding failures behind retries without surfacing the underlying cause
- caching without lockfile or invalidation discipline
- relying on end-to-end tests as the only gate
- omitting artifacts needed to diagnose red jobs
- path filters that silently skip required validation
- merging despite red required checks

When a failure is also a release gate, invoke `no-mistakes` before ship, push, or PR completion claims.
