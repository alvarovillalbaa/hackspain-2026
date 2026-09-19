# Code Tests Cookbook

Project-specific test rules and patterns for Django/DRF backends with Celery.

Complements:
- `python-backend-tests.md` for pytest mechanics and patterns
- `django-drf-testing.md` for DRF-specific examples
- `backend-testing.md` for strategy

## Core rules

- Tests live in `tests/` only, in the canonical folders: `unit/`, `integration/`, `e2e/`, `smoke/`, `regression/`, `adversarial/`, `evals/`, `tmp/`, plus support directories. Layout and placement rules: [`../../quality-assurance/references/test-suite-layout.md`](../../quality-assurance/references/test-suite-layout.md).
- Tests are not deleted by default. Consolidate or mark deprecated instead of removing.
- New logic requires TDD: failing test → minimal implementation → refactor.
- If a view triggers downstream services or tasks, write an integration or e2e test that covers the full chain. Add unit tests only for pure logic or tricky edge cases.

## TDD workflow

1. Write a failing test expressing the behavior (prefer class/workflow level first).
2. Implement the minimal change to pass.
3. Refactor while keeping behavior constant.

## Test pyramid targets

- `unit`: hundreds — fast, isolated, no DB
- `integration`: dozens — DB, HTTP, Celery, signals
- `e2e`: few — full workflow
- `smoke`: minimal — critical paths before deploy
- `regression`: one pinned proof per fixed defect class
- `adversarial`: few — abuse of own interfaces, gated and non-blocking
- `evals`: few — wraps an externally defined eval suite

## Database fidelity

Choose the lowest tier that still proves the claim. Tier definitions, provisioning, and the Tier 5
gate: [`../../quality-assurance/references/test-data-tiers.md`](../../quality-assurance/references/test-data-tiers.md).
This repo's instantiation:

- **T1 (no data)**: pure logic only
- **T3 (local replica)** — the default: managed by pytest-django
- **T4 (staging replica)**: when behavior depends on indexes, constraints, or query plans and a local container cannot prove it — use the runner below

## Tier 4 (staging replica) runner

Script: `tests/scripts/run_ecs_tests.sh`

Every write this runner makes must be rolled back or compensated before the run exits; the target is
shared, so truncation-based cleanup is not available. **This runner must never point at a production
cluster, and its task definition must not carry production credentials.**

Required env: `ECS_SUBNET_IDS`, `ECS_SECURITY_GROUP_IDS`

Defaults: `ECS_CLUSTER=clous-app`, `ECS_TASK_DEF=clous-web`, `ECS_CONTAINER_NAME=web`, `ECS_LAUNCH_TYPE=FARGATE`, `ECS_ASSIGN_PUBLIC_IP=DISABLED`

Default run: `pytest -m integration --maxfail=1` inside the VPC where DB/Redis/S3/Secrets are reachable.

Pass args: `./tests/scripts/run_ecs_tests.sh -m "unit" tests/integration`

IAM needed: `ecs:RunTask`, `ecs:DescribeTasks`, `logs:DescribeLogStreams`, `logs:FilterLogEvents`

## Fixtures and tooling

| Concern | Tool |
|---|---|
| Model factories | `factory_boy` + `faker` |
| Celery tasks | `pytest-celery`, `CELERY_TASK_ALWAYS_EAGER=True` |
| Settings overrides | `pytest-django` `settings` fixture |
| AWS/S3 | `moto` |
| HTTP client | DRF `APIClient` via fixture |
| Time control | `freezegun` |
| Async | `pytest-asyncio` |
| External HTTP | `responses`, `httpretty`, or `vcrpy` |
| External patching | `mocker` from `pytest-mock` |

Keep factories in `tests/factories/`. Define `conftest.py` at root of `tests/` for shared fixtures: `user_factory`, `company_factory`, `api_client`, `authenticated_client`.

Celery eager mode and signal initialization override should be enabled globally via autouse fixtures in `conftest.py`.

## Celery task patterns

**Unit**: call the task body directly or via `.delay()` with `CELERY_TASK_ALWAYS_EAGER=True`. Assert DB state or return value. Mock only external boundaries (AI services, APIs).

**Integration**: Use `.delay()` in eager mode. Assert observable outcomes (DB rows, status fields), not just that `.delay()` was called.

**Retry tests**: Use `side_effect` lists on mocks to simulate transient failures.

**Schedule verification**: Assert `app.conf.beat_schedule` contains expected task names and intervals.

## OAuth integration pattern

Every OAuth integration should cover 7 scenarios:

1. ✅ Happy path: successful flow — assert HTTP response AND database integration record
2. ❌ Token exchange failure — expect 500 with error code
3. ❌ User info fetch failure — token succeeded but profile fetch failed
4. ❌ Missing required parameters — expect 400 with specific error code
5. ❌ Invalid redirect URI — security check, expect 400
6. 🔄 Existing integration update — re-auth updates, not duplicates
7. 🔒 Unauthenticated access — expect 401

Template: `tests/integration/test_microsoft_oauth_integration.py`

Mock `requests.post` and `requests.get`. Assert both HTTP response and database state.

## Mocking rules

The "mock these" list below defines Tier 2.

**Mock these (external boundaries):**
- `requests.post`, `requests.get`
- `boto3.client('s3')`
- External AI clients
- `smtplib.SMTP`
- File system operations when persistence is not the claim

**Never mock these:**
- Django ORM
- Your own service methods or business logic
- Serializers
- Django signals

Mock at the highest useful level: patch `requests.post` returning a mock response, not individual `Response.json` calls.

Assert mock calls only when the external contract itself is the claim (e.g., email recipient, S3 key). Assert outcomes (DB state, HTTP response, return value) for business behavior.

## Anti-patterns

- **Import-only tests**: `assert module is not None` proves nothing.
- **Over-mocking internals**: patching your own services defeats the test.
- **Asserting only `mock.called`**: tests the mock, not the feature.
- **Mocking ORM or serializers in integration tests**: bypasses real behavior.
- **Testing implementation details**: tests should survive refactors that preserve behavior.
- **Global signals firing in unrelated tests**: disconnect signals that are not relevant to the test.

## Django signals

For on_commit callbacks: use `@pytest.mark.django_db(transaction=True)`.

Unit test signal handlers by calling the handler function directly with a mock instance. Integration test by creating the triggering object and asserting post-commit side effects.

## Pre-commit and CI

```bash
pytest -m "unit or smoke" --maxfail=5   # pre-commit
pytest -m unit                           # fast local
pytest -m integration                   # with DB
pytest -n auto -m unit                  # parallel unit tests
pytest --cov=. --cov-report=term-missing
```

Coverage targets: overall 80%+, services 90%+, views 85%+, models 70%+.

## Quick checklist

- [ ] Test type chosen and marked: `@pytest.mark.unit/integration/e2e/smoke`
- [ ] DB access uses `@pytest.mark.django_db`
- [ ] Only external boundaries are mocked
- [ ] Assertions on behavior (outcomes, DB state, responses)
- [ ] AAA pattern: Arrange → Act → Assert
- [ ] Test name describes the behavior
- [ ] Test runs in <500ms (if not, mark `@pytest.mark.slow`)
