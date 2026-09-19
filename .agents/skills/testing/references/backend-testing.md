# Backend Testing Reference

## Scope

Use this reference for backend or service-heavy systems: APIs, domain services, databases, queues, schedulers, external integrations, and migrations.

For Python-specific backend test design with pytest, Django/DRF, Celery, signals, and serializer/view patterns, also read [python-backend-tests.md](./python-backend-tests.md).

## Purpose and philosophy

Backend QA should bias toward the cheapest proof that still exercises the behavior users depend on.

- prefer workflow-level or class-level tests when the bug risk lives at boundaries between routing, validation, persistence, and async handoff
- keep pure transformations and policy decisions in fast unit tests
- treat heavy operational scripts, migration checks, and production-like harnesses as supplements to automated tests, not replacements
- preserve existing test intent; consolidate overlap instead of deleting coverage casually

## Policy First

- Read repo-local rules before deciding whether tests may be run, which suites are mandatory, where tests live, and what evidence format is expected.
- If the repo or user does not want tests run proactively, still choose the right proof path and state what should be run later.
- Choose the lowest data tier that can prove the claim. See [`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md).
- New suites use the canonical layout in [`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md): `unit/`, `integration/`, `e2e/`, `smoke/`, `regression/`, `adversarial/`, `evals/`, `tmp/`, plus support directories. In a repo that already has `contract/`, `scripts/`, or `factories/`, keep them and align new tests to the canonical folder for their type rather than adding further top-level buckets. Record any deviation in `tests/README.md` instead of silently forking the contract.

## Test shape by layer

The canonical framework-per-test-type mapping is
[`../../quality-assurance/references/test-frameworks.md`](../../quality-assurance/references/test-frameworks.md);
the tools column below is the summary.

| Layer | What to prove | Typical tools |
|---|---|---|
| Unit | pure logic, parsing, validation, policy decisions | pytest, vitest, rspec, go test |
| Integration | DB writes, HTTP handlers, serialization, auth, queues, jobs | pytest-django, supertest, rspec request specs |
| Contract | request or event shape to external systems | pact, schema assertions, fixture-based contract tests |
| End-to-end | high-value workflows across multiple layers | browser or API-driven flows |
| Regression | that a fixed defect class has not returned | the runner of the layer where the bug lived |
| Adversarial | that a defensive control fires under abuse of your own interfaces | hypothesis, schemathesis, fast-check, playwright |
| Evals | that the build passes an externally defined eval suite | the repo's runner as a thin client |
| Migration or rollout | schema safety, backfills, compatibility | migration tests, fixture snapshots, production-like harnesses |

## API and transport tests

For API routes or controllers:
- test success, auth, validation failure, not-found, and conflict paths
- assert response shape and persisted state together
- prefer real routing and middleware over direct handler invocation when the transport matters
- if serialization is a contract, assert field names and error semantics explicitly

Useful checks:
- content type and status code
- auth and permission boundaries
- tenant or account scoping
- pagination, filtering, ordering
- retrieval depth, field expansion, or include semantics
- idempotency for create or retry paths
- error payload stability

## Domain and service tests

If the architecture uses a service layer, treat it as the primary home for business logic tests.

- unit-test pure policy and transformation functions
- integration-test services that touch DB, queues, or multiple repositories
- avoid mocking the service under test from one layer above if that hides behavior you actually care about
- verify side effects directly: rows written, events emitted, calls made to true external boundaries
- keep transport tests focused on routing, auth, validation, and serialization instead of duplicating every service branch

## Database tests

Use real persistence when the behavior depends on:
- constraints
- transactions
- nullability
- locking or concurrency
- indexes and query count
- serialization of actual stored values

Test migration and rollout risk when schemas change:
- forward migration
- rollback viability if the platform expects it
- mixed-version compatibility when old and new app versions may overlap
- backfills on realistic data volume if the change is risky
- enqueue-after-commit or equivalent transaction handoff when async work follows writes

Default tier choices — full definitions, provisioning, and the Tier 5 gate are in
[`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md):

- **T1 (no data)** for pure logic, deterministic transformations, and policy functions
- **T2 (mock data)** for boundaries you own no state in
- **T3 (local replica)** for ORM behavior, serializers, handlers, service objects, and most async integration tests
- **T4 (staging replica, writes rolled back)** for engine-specific behavior, queue semantics, network topology, or rollout validation that lower tiers cannot prove
- **T5 (production, read-only)** only under the four-condition gate, and never for anything a lower tier can prove

## Jobs, queues, and async workers

For background work:
- test retry safety and idempotency
- test timeout, cancellation, and dead-letter behavior when supported
- use eager or inline execution only when it still proves the behavior
- add at least one path that exercises the real job envelope if the queue contract matters

Common bugs to catch:
- duplicated side effects on retry
- stale reads before transaction commit
- missing correlation IDs or logging context
- jobs that succeed only because tests execute synchronously
- handlers that do too much instead of delegating to an owning service

If the repo uses signals, webhooks, or schedulers, prefer at least one test path that triggers the real entrypoint when the handoff itself matters.

## Operational verification scripts

Some backend risks are too expensive or environment-specific for the normal PR suite. Put those checks in repo-local validation scripts or dedicated ops workflows when needed:

- schema or migration validation on realistic data
- infra-bound connectivity checks
- queue, scheduler, or cron verification
- auth flow verification against sanctioned test environments

These scripts should produce repeatable evidence and complement the main automated suite.

## External integrations

Mock or emulate the boundary, not the internal caller.

- keep fixture payloads realistic and versioned
- assert both outbound request shape and inbound failure handling
- test rate limits, timeouts, partial failures, and malformed payloads
- prefer contract fixtures or schema checks over hand-built dict fragments

## Security and Multi-Tenancy

Backend regressions often leak data before they throw errors. Add explicit tests for:

- authenticated vs unauthenticated behavior
- permission downgrade or missing-role behavior
- tenant, company, or account isolation
- redaction of secrets or sensitive fields in responses and logs
- file upload validation and cleanup when the backend accepts files

## Concurrency and correctness

Backend bugs often appear only under race or retry conditions. Add explicit tests for:
- double submission
- duplicate webhook delivery
- concurrent updates to the same row or entity
- stale cache after mutation
- read-after-write timing assumptions

When true concurrency is hard to automate, define the exact manual or load-test proof instead of pretending a unit test covers it.

## Stack-specific defaults

The canonical framework-per-test-type mapping lives in
[`../../quality-assurance/references/test-frameworks.md`](../../quality-assurance/references/test-frameworks.md).
The defaults below are the language-level detail underneath it.

### Python

- `pytest` for all layers
- use real DB for ORM behavior
- freeze time when temporal logic matters
- keep fixtures in `conftest.py` or local factories
- for Django or DRF, exercise the real API client when routing, auth, middleware, or serializers matter; see `django-drf-testing.md` for concrete patterns, Factory Boy setup, and common failure patterns
- for async Python, test the framework-approved sync/async boundary instead of silently mixing blocking I/O into async code

### Node or TypeScript

- `vitest` or `jest` for unit and integration
- `supertest` for HTTP layers
- use `msw` or explicit fetch mocking for outbound HTTP
- assert runtime and type contracts separately
- for Express, Fastify, or Nest, boot the real app or module when middleware and serialization are part of the contract

### Ruby

- `rspec` request or model specs for Rails
- factories over ad hoc model creation
- transactional cleanup unless the test truly needs committed state

### Go

- prefer table-driven unit tests
- use ephemeral containers for DB-backed integration
- verify context cancellation and timeout behavior explicitly
