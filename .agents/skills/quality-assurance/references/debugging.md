# Debugging Reference

Cross-cutting failure diagnosis, shared by every QA lane. Reach for a child skill once the failure
class is known: `testing` for coverage and suite design, its `flake` child for intermittency, and
`frontend-e2e` for browser-level symptoms.

## Contents

- [Debugging loop](#debugging-loop)
- [Triage the failure class first](#triage-the-failure-class-first)
- [Read failures completely](#read-failures-completely)
- [Error diagnosis workflow](#error-diagnosis-workflow)
- [CI-only failure workflow](#ci-only-failure-workflow)
- [Regression correlation](#regression-correlation)
- [Flaky test protocol](#flaky-test-protocol)
- [Performance debugging](#performance-debugging)
- [Performance diagnosis workflow](#performance-diagnosis-workflow)
- [Observability-led debugging](#observability-led-debugging)
- [Error Pattern Reference](#error-pattern-reference)
- [CI-Only Failure Patterns](#ci-only-failure-patterns)
- [Debugging Async Code](#debugging-async-code)

## Debugging loop

Never jump from symptom to fix. Use this order:

1. Reproduce the failure.
2. Reduce it to the smallest reliable case.
3. Read the full error, logs, or diff.
4. Correlate with recent code, config, or dependency changes.
5. Form one concrete hypothesis at a time.
6. Prove or falsify the hypothesis quickly.
7. Fix the root cause and verify with a regression proof.

## Triage the failure class first

| Failure class | Typical signal | First move |
|---|---|---|
| Crash or exception | stack trace, panic, unhandled rejection | read the full trace from root cause outward |
| Wrong output | no crash, wrong value or DOM | tighten assertions and isolate inputs |
| Flaky | passes sometimes | search for shared state, time, randomness, race conditions |
| CI-only | local passes, CI fails | diff env, OS, container, secrets, cached state |
| Performance | slow request, timeout, OOM | measure before changing code |
| Data or rollout issue | works on fresh data, fails on real data | inspect migrations, nullability, mixed-version compatibility |

## Read failures completely

Common mistake: reading only the last line.

- In stack traces, start at the root cause and work outward.
- In assertion failures, inspect expected vs actual values, local variables, and fixture setup.
- In CI logs, identify the first failing step, not just the final job summary.
- In browser failures, inspect console errors, network failures, screenshot or trace artifacts, and DOM timing.

## Error diagnosis workflow

For application errors, move in this order:

1. Extract the concrete context: module, line, function, failing input, environment, and first visible symptom.
2. Identify the owner layer: transport, schema or validation, domain logic, persistence, async job, external integration, or UI state.
3. Correlate with recent code, config, dependency, schema, or data-shape changes.
4. Fix the root cause and add the narrowest regression proof that would have caught it.
5. Record residual risk if the bug depends on production-only data volume, concurrency, or rollout state.

Useful prompts to answer before editing:

- What exact input or state made this path fail?
- Did the code assume a field, relation, env var, cache entry, or timing guarantee that is not actually guaranteed?
- Is the symptom happening at the true owner layer, or only surfacing there from a deeper fault?
- What smaller test or reproduction isolates the fault without the rest of the stack?

## CI-only failure workflow

When something fails only in CI:

1. Compare runtime versions: language, package manager, browser, DB, OS image.
2. Compare env and secrets presence, not just values.
3. Compare working directory, path filters, and changed-files logic.
4. Check cache keys and stale artifact reuse.
5. Re-run the exact CI command locally or in a matching container if possible.
6. Inspect whether tests rely on wall clock, locale, timezone, filesystem ordering, or network availability.

Frequent causes:
- missing env var or secret
- path-dependent file lookup
- dependency drift between local and CI
- hidden reliance on local services or seeded data
- race condition exposed by slower or faster CI machines

## Regression correlation

Use history before guessing.

```bash
git log --oneline -- path/to/failing/file
git blame path/to/file
git diff <known-good>...HEAD -- path/to/file
git bisect start
```

Patterns that often explain sudden failures:
- new required field or schema change
- renamed import or moved symbol
- stricter auth or feature-flag logic
- altered serialization shape
- dependency upgrade or test runner upgrade
- hidden change in default timezone, locale, or clock

## Flaky test protocol

Flakes have causes. Find the dimension that changes:

- order: the test depends on another test having run first
- time: midnight, DST, token expiry, debounce, retry windows
- randomness: UUIDs, Faker, seeds, unstable sorting
- concurrency: unsafely shared resources, parallel workers, missing awaits
- environment: browser, OS, path casing, CPU speed, network availability
- leakage: global state, DB rows, files, sockets, mocks not reset

Useful tactics:
```bash
pytest path::test_name -x -vv
pytest path::test_name --count=20
pytest --randomly-seed=<seed>
npx playwright test --repeat-each=10
```

Fixes usually involve:
- hermetic setup and teardown
- fake or frozen time
- deterministic data
- replacing `sleep()` with explicit wait conditions
- isolating shared mutable state
- reducing reliance on test order or global caches

## Performance debugging

Measure first. Performance bugs often masquerade as correctness bugs in CI.

Watch for:
- N+1 queries or repeated HTTP calls in loops
- repeated rendering or expensive selectors in UI
- full-table scans, missing indexes, or no pagination
- loading unbounded data into memory
- retries without backoff or cancellation

Good proof patterns:
- query count assertions for hot endpoints
- benchmark or profiling comparison before and after the change
- browser traces and performance profiles for UI regressions
- memory snapshots for leaks or runaway caches

## Performance diagnosis workflow

1. Capture a baseline: response time, query count, retry count, CPU, memory, render time, or queue latency.
2. Identify the dominant cost class: database, network, render, serialization, lock contention, retry storm, or unbounded iteration.
3. Reproduce with the smallest realistic dataset or request shape that still shows the problem.
4. Change the dominant cost driver first instead of spreading small guesses across many layers.
5. Re-measure the same scenario after the fix.

Common root causes:

- N+1 queries or repeated API calls in loops
- missing indexes, full scans, or unbounded result sets
- repeated serialization or expensive derived fields on hot paths
- loading large datasets into memory instead of streaming or chunking
- retry loops without backoff, cancellation, or deduplication
- browser work tied to every render instead of meaningful state changes

## Observability-led debugging

If logs, metrics, traces, or artifacts already exist, use them before adding new instrumentation.

Useful evidence sources:
- structured error logs with request or trace IDs
- CI artifacts: screenshots, videos, junit XML, coverage XML
- DB slow query logs
- browser console and network traces
- queue retries, dead-letter queues, worker heartbeats

Add instrumentation only after confirming existing signals are insufficient, and remove temporary noise once the issue is resolved.

If the failing path is:

- request-driven: follow request or trace IDs across gateway, app, datastore, and downstream calls
- queue-driven: inspect enqueue time, retry history, dead-letter flow, and worker logs together
- browser-driven: inspect network waterfall, console, performance trace, and UI state transitions together
- rollout-driven: compare release version, config, feature flags, migration state, and environment scope
---

## Error Pattern Reference

### Python / Django

| Error | Common Cause | Fix |
|---|---|---|
| `KeyError: 'field'` | Dict access without `.get()` | `data.get('field')` with guard |
| `AttributeError: 'NoneType'` | FK or `.get()` returned None | Null check before attribute access |
| `OperationalError: no such column` | Migration not applied | `python manage.py migrate` |
| `ValidationError: {...}` | Required field missing in request | Check required fields in serializer |
| `IntegrityError: UNIQUE constraint` | Duplicate insert | Check for existing record first |
| `DoesNotExist` | `.get()` with no match | Use `.filter().first()` or handle exception |
| `MultipleObjectsReturned` | `.get()` with multiple matches | Add more specific filter |
| `RecursionError` | Circular signal or recursive call | Check signal handlers; add recursion guard |
| `celery.exceptions.Retry` | Task explicitly retrying | Expected; check max_retries |

### JavaScript / TypeScript

| Error | Common Cause | Fix |
|---|---|---|
| `TypeError: Cannot read property 'x' of undefined` | Missing null check | Optional chaining: `obj?.x` |
| `TypeError: x is not a function` | Wrong type passed | Check type before calling |
| `UnhandledPromiseRejection` | Missing `await` or `.catch()` | Add try/catch or `.catch()` |
| `ReferenceError: x is not defined` | Incorrect import or scope | Check import paths |
| `Maximum call stack size exceeded` | Infinite recursion | Add base case; check event listeners |
| `CORS error` | Missing CORS header | Configure server CORS; check origin |
| `Hydration mismatch` | SSR/CSR output differs | Ensure same rendering logic on server and client |

---

## CI-Only Failure Patterns

When a test passes locally but fails in CI:

| Pattern | Cause | Fix |
|---|---|---|
| Missing env var | CI doesn't have the same `.env` | Add to CI secrets; check `required_env_var` guards |
| Different Python/Node version | CI uses different runtime | Pin version in CI config |
| Missing migration | Local DB has extra state; CI starts fresh | Ensure migration is committed |
| Port conflict | CI runs multiple services on same port | Use dynamic ports or wait logic |
| Timezone difference | CI runs in UTC; local is different | Freeze time in tests; don't rely on local timezone |
| DB not ready | CI starts DB in parallel with tests | Add health checks / wait-for-it scripts |
| Missing `git fetch` | Shallow clone in CI misses history | Use `fetch-depth: 0` in CI config |

---

## Debugging Async Code

```python
# Python async — use asyncio.run in tests
import asyncio
import pytest

@pytest.mark.asyncio
async def test_async_operation():
    result = await my_async_function()
    assert result == expected

# Django async views
from django.test import AsyncClient

@pytest.mark.asyncio
@pytest.mark.django_db
async def test_async_view():
    client = AsyncClient()
    resp = await client.get('/api/async-endpoint/')
    assert resp.status_code == 200
```

```typescript
// JavaScript async — always await assertions
it('fetches data', async () => {
  const data = await fetchData()
  expect(data).toEqual({ id: 1 })
})

// React async rendering
it('shows data after loading', async () => {
  render(<DataComponent />)
  await waitFor(() => expect(screen.getByText('Loaded')).toBeInTheDocument())
})
```
