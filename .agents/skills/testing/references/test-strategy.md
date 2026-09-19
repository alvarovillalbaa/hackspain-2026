# Test Strategy Reference

External owner boundary:

- Use `tdd` for red-green-refactor, tracer bullets, public-interface behavior tests, and mocking discipline.
- Use `codebase-design` when test strategy depends on interface, seam, depth, adapter, locality, or testability decisions.

This local reference owns portfolio selection, AI/eval testing, coverage interpretation, and release-suite placement.

## Select the proving layer first

Pick the cheapest test that can prove the claim. If a lower layer cannot prove it, move up.

| Behavior to prove | Primary proof path |
| --- | --- |
| Pure transform or algorithm | Unit |
| Service or domain rule with persistence | Integration |
| HTTP contract, auth, serialization, routing | Integration |
| User flow across pages, services, or jobs | E2E |
| Production readiness gate | Smoke |
| Third-party compatibility | Contract or integration |

Use one primary proof path per behavior. Do not duplicate the same assertion across layers unless each layer protects a different risk.

## Standard test portfolio

Use the classic pyramid as a directional guide, not a hard quota.

| Layer | Typical share | Role |
| --- | --- | --- |
| Unit | ~70% | Fast deterministic logic. |
| Integration | ~20% | Real boundaries such as DB, HTTP, queues, auth, serialization. |
| E2E | ~10% | Critical user flows only. |

Repos with thin logic and thick integrations may shift toward integration-heavy suites.

## AI application portfolio

When the system uses LLMs, RAG, tools, or autonomous agents, add eval layers:

| Layer | Typical share | What to prove |
| --- | --- | --- |
| Deterministic unit tests | 40-60% | schemas, filters, prompt builders, parsers, scoring |
| Contracts/integrations/retrieval/tools | 20-30% | tool call shapes, retrieval contracts, auth, mocked LLM responses |
| Offline evals | 10-20% | output quality, groundedness, refusal behavior, format compliance |
| E2E agent workflows | 5-10% | multi-step behavior and state transitions |
| Human QA / red team | 1-5% | nuanced safety, trust, and brand risks; automated portion lives in `tests/adversarial/`, see [`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md) |

Prefer established eval frameworks when the project already uses one. Keep live model calls out of normal CI unless the repo explicitly accepts the cost and variance; [`../../quality-assurance/references/test-evals-wrapping.md`](../../quality-assurance/references/test-evals-wrapping.md) defines the skip-when-unconfigured mechanism that enforces this.

## Component strategy

| Component type | Primary test types |
| --- | --- |
| API endpoints | business-logic unit tests, HTTP integration tests, consumer contracts |
| Data pipelines | input validation, transformation correctness, idempotency |
| Frontend | component interaction, accessibility, visual regression, selected E2E |
| Infrastructure | smoke tests, policy checks, rollout checks |

## What to cover

Cover:

- business-critical paths
- error handling and recovery
- permissions and security boundaries
- data integrity
- migrations and rollout behavior
- concurrent, duplicate, empty, malformed, expired, and unauthorized cases

Skip:

- trivial getters/setters
- framework code
- generated code unless generation itself changed
- one-off scripts unless they are release-critical

## Coverage interpretation

Coverage is a signal, not the goal.

- Diff coverage is often more useful than global coverage.
- Low coverage in critical domains matters more than high coverage in wrappers.
- A covered line may still hide an untested branch.
- Exclude generated files, migrations, and framework glue deliberately.
- Do not lower thresholds just to make CI pass.

Useful threshold patterns:

- changed-code coverage on PRs
- full-project coverage on main or nightly
- separate thresholds by package or domain when one global number hides risk

## Release-oriented suites

| Moment | Suites |
| --- | --- |
| Local tight loop | lint, types, focused unit or integration |
| PR gate | lint, types, targeted unit/integration, build |
| Merge to main | broader integration, selected E2E, security scans |
| Nightly | full suite, slow jobs, browsers, fuzz/property tests |
| Pre-release | smoke, migrations, rollout checks, synthetic monitoring |

Keep fast suites authoritative for everyday work. Slow suites must earn their cost with risks the fast suites cannot catch.

## Strategy document template

```markdown
## Testing Strategy

### Claims to prove
- ...

### Primary proving layers
- Unit:
- Integration:
- E2E:
- Eval:

### Coverage policy
- Target:
- Minimum:
- Critical paths:

### Execution schedule
- Local:
- PR:
- Main:
- Nightly/pre-release:

### Escalation
- Flaky test:
- Coverage drop:
- Missing proof for critical behavior:
```

For test-first implementation mechanics, chain to `tdd` instead of expanding this template.
