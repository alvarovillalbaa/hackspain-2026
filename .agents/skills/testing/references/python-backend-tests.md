# Python Backend Test Design Reference

Use this reference when designing, writing, or refactoring tests for Python backend systems with `pytest`, especially when the work touches services, HTTP APIs, serializers, ORM models, Celery tasks, signals, or persistence-heavy workflows.

This file complements:
- `pytest.md` for pytest mechanics, plugins, and syntax
- `django-drf-testing.md` for Django and DRF-specific examples
- `backend-testing.md` for language-agnostic backend QA strategy
- `testing-anti-patterns.md` for mock and test-design smells

## Purpose and philosophy

Default to behavior-first verification:
- prefer class-level or workflow-level tests when the bug risk sits at boundaries between routing, validation, persistence, and async handoff
- keep unit tests for pure logic, edge conditions, and transformations that are cheaper to prove in isolation
- use heavy operational scripts or production-like harnesses only when lower-fidelity environments cannot prove the behavior
- preserve existing test intent; refactor or consolidate overlap rather than deleting coverage casually

The priority order is:
1. integration and end-to-end tests for real behavior
2. unit tests for pure logic and tricky edge cases
3. scripts or production-like validation for expensive operational checks

## Choose the proving layer first

Pick the cheapest test that can actually prove the claim.

| Layer | Best for | Data tier | External boundaries |
|---|---|---|---|
| Unit | Pure logic, transformations, validation, parsing, routing decisions | T1 | Mock or fake |
| Integration | HTTP handlers, serializers, ORM behavior, task side effects, signal handoffs | T3 | Mock or emulate |
| E2E | Critical workflows spanning multiple components | T3, or T4 | Prefer realistic contracts |
| Smoke | Deployment-readiness checks for the highest-value paths | T3, or T4 | Minimal but realistic |
| Regression | Pinned proof that a fixed defect class has not returned | inherits the layer where the bug lived | as that layer |
| Adversarial | Abuse of own interfaces: economic, authorization, workflow bypass | T2, T3, or gated T4 | own surface only |
| Evals | Wrapping an externally defined eval suite (AI products) | T1 or T2 | the eval system only |
| Scripts | Infra-bound or operational validation; a support directory, not a test type | realistic or sanctioned target | Minimal and repeatable |

Rules of thumb:
- If a view, task, or signal matters because of side effects across components, favor integration over micro-unit tests.
- If the logic is pure and deterministic, keep it in unit tests.
- If a lower layer cannot prove the behavior, move up one layer instead of over-mocking.

## Environment fidelity

Choose the lowest tier that still proves the behavior: **T1** no data, **T2** mock data, **T3** local
replica database, **T4** staging replica with rollback, **T5** production read-only. Definitions,
provisioning, and the Tier 5 gate are in
[`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md).

**Never write to production.** Automated tests may never create, update, delete, or migrate
production data, and may never invoke production services that cause side effects — no emails,
charges, webhooks, queue publishes, or third-party calls against live accounts.

The single permitted exception is **Tier 5 (production, read-only)**, subject to all four gate
conditions: a database role with no write grants, a recorded authorization reference that fails
closed, exclusion from the default suite and every PR gate, and read-only invariant assertions only.
If you cannot demonstrate that the role is read-only, the tier is unavailable — fail the test rather
than proceeding.

## Recommended layout

Follow repo-local conventions first. If you are establishing structure from scratch, use the
canonical layout in
[`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md).
A Python instantiation that mirrors the application:

```text
tests/
├── conftest.py
├── factories/
├── unit/
│   ├── services/
│   ├── models/
│   ├── tasks/
│   └── utils/
├── integration/
│   ├── api/
│   ├── tasks/
│   ├── signals/
│   └── external/
├── e2e/
├── smoke/
├── regression/
├── adversarial/
├── evals/
├── tmp/
└── scripts/
```

Guidance:
- Do not invent top-level buckets outside the canonical folders plus support directories. Sub-directories inside a canonical folder, as above, are encouraged when they mirror the application.
- Mirror the application module structure when that improves discoverability.
- Prefer descriptive names such as `test_create_job_rejects_unauthorized_user`.
- Register and use explicit markers such as `unit`, `integration`, `e2e`, `smoke`, `slow`, and `asyncio`.
- Prefer consolidating redundant tests over proliferating near-duplicates.

## Markers and suite selection

Use repo-defined markers first. If the repo does not already define them, these are sensible defaults:

- `unit`: fast, isolated tests with no real DB or network
- `integration`: DB or boundary interactions such as HTTP handlers, tasks, and signals
- `e2e`: full workflows across multiple layers
- `smoke`: critical-path sanity checks
- `regression`: pinned proof that a fixed defect class has not returned
- `adversarial`: abuse of own interfaces; gated, non-blocking, deselected by default
- `evals`: wraps an externally defined eval suite; deselected by default
- `tmp`: scratch; never collected in CI
- `tier1` through `tier5`: the data tier the test declares
- `slow`: intentionally expensive tests
- `asyncio`: async tests when the plugin or framework requires explicit marking

Typical commands:

```bash
pytest -m unit
pytest -m integration
pytest -m e2e
pytest -m smoke
```

## Fixtures and tooling

Default Python stack:
- `pytest`
- `pytest-cov`
- `pytest-mock`
- `pytest-asyncio`
- `pytest-xdist`

Useful backend-specific additions:
- `pytest-django` for Django and DRF projects
- `factory_boy` and `Faker` for realistic test data
- `freezegun` for time-dependent behavior
- `hypothesis` for complex pure logic
- `moto`, `responses`, `respx`, or `vcrpy` for external integrations as appropriate

Fixture guidance:
- Keep shared setup in `tests/conftest.py` or narrowly scoped local `conftest.py` files.
- Keep factory defaults valid and boring; override only what the test cares about.
- Prefer reusable fixtures for authenticated clients, seeded objects, and fake external clients.
- Avoid fixtures that hide critical preconditions such as roles, feature flags, or tenant scope.
- If the repo already provides task eager mode, transaction helpers, or custom API clients, use them rather than open-coding setup in each test.

## TDD owner

Use external skill `tdd` for red-green-refactor, bug-fix regression flow, tracer bullets, and public-interface test discipline. Keep this file focused on Python/backend fixtures, commands, framework patterns, and persistence-specific proof paths.

## Core patterns

### Prefer pure pytest style

Use plain pytest tests and fixtures by default. Avoid heavyweight `unittest.TestCase`-style setup unless a framework-specific constraint makes it necessary.

Prefer:
- Arrange -> Act -> Assert structure
- fixture-driven setup
- direct `assert` statements
- `mocker` or `monkeypatch` instead of sprawling decorator stacks

### Parameterize repeated cases

Use `@pytest.mark.parametrize` for input grids, validation matrices, and boundary conditions instead of copy-pasted tests.

### Use property-based tests for complex pure logic

Reach for Hypothesis when the logic has a large input space and deterministic properties matter more than a handful of example cases.

### API endpoints and transport boundaries

For HTTP handlers, views, or viewsets:
- use the real test client when routing, middleware, auth, permissions, or serialization matter
- cover success, auth failure, permission failure, validation failure, not-found, and conflict paths
- assert both the HTTP response and the persisted side effects
- verify tenant or account isolation explicitly

Typical assertions:
- status code
- response shape
- database state
- emitted events or enqueued jobs when they are part of the contract

### Serializers and request validation

For serializers, forms, and schema validation:
- test valid data and invalid data
- test read-only and server-controlled fields
- test custom validation branches
- test context-dependent behavior when request or actor context changes the result
- test nested or transformed output only when the shape is part of the public contract

### Services and domain logic

Treat the service layer as the main home for business logic when the architecture has one.

- keep pure logic pure when possible
- inject or patch external dependencies at the boundary
- assert outcomes, not internal call graphs
- integration-test services that span DB writes, queues, or multiple repositories
- prefer one test that exercises the full service workflow over several micro-tests of private helpers

### Celery tasks and background jobs

Split testing by intent:

- **Unit**: treat the task body as a function; verify business behavior with external calls mocked
- **Integration**: exercise the real task envelope when queue semantics, retries, or transaction handoff matter

Important checks:
- idempotency on retry
- timeout and retry behavior
- committed-state visibility when work starts after a write
- observable side effects rather than only `.delay()` having been called

Eager mode is useful, but it can hide bugs that only appear with a real queue or worker boundary.

### Signals, hooks, webhooks, and on-commit handoffs

If a signal or hook contains meaningful logic:
- extract the heavy logic into a helper or owning service if that makes testing simpler
- test the helper directly when the logic is substantial
- add at least one integration test that triggers the real signal or hook when the handoff itself matters

Be careful with transaction semantics:
- if behavior depends on commit hooks, use a test mode that actually commits
- assert the post-commit effect, not just that the callback path was invoked

### External auth and OAuth-style integrations

When a backend handles OAuth or similar third-party auth flows, cover at least:
- successful token exchange and account linkage
- token exchange failure
- downstream profile or metadata fetch failure
- missing or invalid required parameters
- invalid redirect or state handling
- reconnect or update of an existing integration
- unauthenticated access

Mock the provider boundary, then assert both the response contract and persisted integration state.

## Backend boundary doubles

For general mocking discipline, use external skill `tdd`. Backend-specific defaults:

- Replace outbound HTTP, cloud SDK, SMTP, filesystem, clock, randomness, and OS process boundaries when live integration is not the proof target.
- Prefer real ORM objects, serializers, routing, and permission machinery in integration tests when the transport or persistence contract matters.
- Use factory objects instead of ad hoc partial payloads when persistence matters.
- Assert provider calls only when the provider contract itself is the behavior under test.

## Execution recipes

Run repo-local commands first. If the repo does not define wrappers, these are sensible defaults:

```bash
pytest -m unit -x --tb=short
pytest -m integration
pytest -k "oauth" -v
pytest tests/integration/api/test_accounts.py -v
pytest -n auto -m unit
pytest --cov=. --cov-report=term-missing
pytest --cov=. --cov-report=html
```

Use scripts or production-like harnesses for:
- migration validation
- infra-bound connectivity checks
- queue or scheduler verification
- sanctioned auth flow validation

Pre-merge defaults:

```bash
pytest -m "unit or smoke" --maxfail=5
```

## Coverage and CI

Coverage is a lagging indicator, not the goal.

Use it to find blind spots:
- changed files with low or zero diff coverage
- error handling and fallback branches
- retries, timeouts, cancellation, and concurrency paths
- public entry points with no regression coverage

Useful defaults:
- unit and integration checks in the normal PR gate
- broader integration plus selected E2E on merge to main
- smoke, slow, property-based, or mutation-style checks on nightly or pre-release pipelines

Prefer stable thresholds over vanity metrics:
- do not lower thresholds just to green the build
- exclude generated code and framework glue explicitly, not casually
- treat critical domains such as auth, billing, and data integrity as higher priority than trivial wrappers

Directional targets when the repo does not define stricter numbers:
- overall coverage: 80%+
- services and domain logic: 90%+
- views and handlers: 85%+
- models and persistence wrappers: 70%+

Parallelize only the suites that are actually isolated.

## Anti-patterns to reject

Avoid these common failure modes:

- **Import-only tests**: proving a module imports is not meaningful behavior coverage.
- **Over-mocking internals**: defer to external `tdd`; if the test replaces the logic it claims to verify, it proves nothing.
- **Asserting only `mock.called`**: this verifies the mock system, not the feature outcome.
- **Mocking the ORM or serializer layer in integration tests**: this bypasses the behavior users rely on.
- **Testing implementation details**: tests should survive refactors that preserve behavior.
- **Copy-pasted micro-tests**: collapse repetitive examples into parameterized cases or stronger workflow tests.
- **Deleting stale tests by default**: preserve the behavior being proven, then refactor or consolidate with approval if removal is warranted.
- **Tests as afterthoughts**: code is not complete if the proof was never written.
- **A Tier 5 test that can issue a write**: a defect regardless of whether it did, because the role is wrong and the next edit to that file is unguarded.
- **Eval logic defined inside `tests/evals/`**: datasets, graders, and thresholds belong to the eval system; the wrapper only asserts the returned gate.
- **`tests/tmp/` files committed, force-added, or left behind at PR time**: scratch is promoted or deleted before the task is declared done.

If a test needs three or more deep mocks just to run, that is usually a design smell. Reconsider the layer or the code shape.

## Troubleshooting common failures

- **Import errors**: confirm dependencies are installed and run pytest from the repo root.
- **DB access errors**: add the repo's DB marker or fixture and ensure the test uses the dedicated test database.
- **Signals or post-commit effects missing**: use a test mode that actually commits and assert on the observable side effect.
- **Celery tasks not executing**: confirm the repo's eager or inline task configuration for tests.
- **Flaky tests**: remove shared state, freeze time when needed, and avoid sleep-based waits.

## Adding a new backend test

Before writing the test:
- choose the proving layer and marker
- place the test in the nearest existing suite directory
- prefer factories or fixtures over hand-built persisted objects
- decide which external boundaries need mocks and which internals must stay real

While writing the test:
- assert on behavior, public contracts, or persisted state
- keep the scenario descriptive and narrow
- collapse repetitive input matrices with parametrization when it improves clarity

Before finishing:
- run the focused test and the surrounding safety net
- update adjacent tests that now assert stale behavior
- note any remaining proof gaps that need a higher-fidelity environment or script

## Recommended default workflow

For most backend feature work:

1. Add one integration or end-to-end test that proves the full user-visible workflow.
2. Add unit tests only for non-trivial pure logic or important edge conditions.
3. Refactor tests to remove duplication while preserving existing intent.
4. Run the focused suite first, then the nearest broader marker before claiming completion.

## Quick checklist

Before finishing a backend test change, verify:
- the chosen layer is the cheapest one that can prove the behavior
- mocks stop at external boundaries
- assertions focus on behavior, persisted state, or public contracts
- time, randomness, and async edges are controlled when relevant
- test names describe the behavior being proven
- new tests follow the repo's established directory and marker scheme
- the surrounding suite needed to protect adjacent behavior was run or explicitly deferred
