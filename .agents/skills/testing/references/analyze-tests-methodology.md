# Analyze Tests Methodology

Framework for auditing test suites against coverage, fidelity, and alignment with testing rules.

## Inventory and structure

- Tests must live under `tests/` in the canonical folders: `unit/`, `integration/`, `e2e/`, `smoke/`, `regression/`, `adversarial/`, `evals/`, `tmp/`, plus the support directories. The layout, the folder-by-tier matrix, and the marker-and-lane table are defined in [`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md).
- New tests mirror the area they exercise.
- Markers must match directory and intent.

Quick audit commands:
```bash
python3 ../quality-assurance/scripts/audit_test_layout.py .
rg -n "pytest.mark.(unit|integration|e2e|smoke|regression|adversarial|evals|tmp|slow)" tests
rg --files -g "test_*.py" tests
pytest -m smoke
pytest -m unit
pytest -m integration
pytest --cov=. --cov-report=term-missing
```

## Test type coverage check

Target mix per test pyramid:

| Type | Volume | Characteristics |
|---|---|---|
| `unit` | Many | Fast, isolated, no DB, no network, <10ms |
| `integration` | Moderate | DB, HTTP, Celery, signals, 50–500ms |
| `e2e` | Few | Full workflows, 1–5s |
| `smoke` | Minimal | Critical paths before deploy |
| `regression` | Grows with defects | One pinned proof per fixed defect class |
| `adversarial` | Few | Abuse of own interfaces, gated, non-blocking |
| `evals` | Few | AI products only; wraps an externally defined suite |
| `tmp` | Zero at PR time | Scratch; promoted or deleted before the task is done |
| `scripts` | As needed | Support directory for heavy infra/ops checks, not a test type |

## Database fidelity audit

Verify coverage exists at each tier that is legal for the folder. The tiers are **T1** no data,
**T2** mock data, **T3** local replica database, **T4** staging replica with rollback, and **T5**
production read-only. Which tiers a folder may use is defined by the matrix in
[`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md);
provisioning and the Tier 5 gate are in
[`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md).

Ask of each folder: is the default tier actually being used, or has the suite drifted upward into
slower, shared environments for behavior a lower tier could prove?

## Framework and tooling check

Canonical framework-per-test-type mapping:
[`../../quality-assurance/references/test-frameworks.md`](../../quality-assurance/references/test-frameworks.md).
The repo-local instantiation:

- `pytest` as runner
- `ruff` enforced for lint/format
- `tests/scripts/` for operational checks
- No deprecated frameworks or ad-hoc scripts outside `tests/scripts/`

## TDD readiness check

For new logic paths:
- [ ] A failing test can be written before implementation
- [ ] Implementation kept minimal to pass
- [ ] Refactor does not break behavior
- [ ] Tests assert behavior, not implementation details

## Scope and over-modularization check

- [ ] Tests are class/workflow-level, not micro-tests of tiny helpers
- [ ] Views that trigger services/tasks have integration/e2e coverage for the full chain
- [ ] Unit tests used only for pure logic or tricky edge cases
- [ ] Redundant tests consolidated rather than left duplicated
- [ ] Stale tests marked deprecated rather than deleted (unless approved)

## Mocking and boundary check

- [ ] Only external boundaries are mocked (HTTP, S3, AI APIs)
- [ ] ORM, serializers, and internal business logic are NOT mocked
- [ ] Assertions target outcomes (DB state, responses, return values), not only mock calls

## Flakiness and performance check

- [ ] Tests are deterministic (no sleeps, no shared mutable state)
- [ ] Time-sensitive logic uses `freezegun`
- [ ] Slow tests marked `@pytest.mark.slow`
- [ ] Async edges controlled with proper timeouts

## Gap identification

After running the audit, produce:

- Missing coverage by type: which `unit/integration/e2e/smoke` lanes lack tests
- Missing DB fidelity: which behaviors lack lower or higher fidelity coverage
- Over-granular tests: candidates for consolidation
- Flaky or slow tests: candidates for refactor or isolation
- Tests asserting only mock calls: candidates for behavior-first rewrite

## Action output format

```markdown
## Test Audit Findings

### Missing coverage
- [Area]: needs [integration] test for [workflow]

### Over-modularization candidates
- [file]: micro-tests for [method]; consolidate into [workflow test]

### Flaky tests
- [test_name]: depends on shared state; isolate with [fixture approach]

### Mock-only assertions
- [test_name]: asserts `mock.called` only; rewrite to assert DB state
```
