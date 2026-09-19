# Test Plan: <Service / Feature Name>

> Plan the tests before writing them. Map behavior and risk to concrete cases.

## Scope

- **Under test:** <service / module / endpoint>
- **Out of scope:** <what these tests deliberately do not cover>
- **Change driving this:** <link to PR / issue / spec>

## Test levels

| Level | What | Where it runs |
| --- | --- | --- |
| Unit | Pure logic, no I/O | every push |
| Integration | Real DB / queue / cache | every push (CI services) |
| Contract | API request/response shape | every push |
| E2E (optional) | Full flow across services | nightly / pre-release |

## Fixtures & test data

- Database: <migrations applied? seeded? truncated between tests?>
- External services: <real / containerized / stubbed at the boundary>
- Factories / builders: <where they live>
- Time / randomness: <how frozen/seeded for determinism>

## Cases

### Happy paths

- [ ] <primary success scenario>
- [ ] <secondary success scenario>

### Validation / input edges

- [ ] Missing required field -> 400
- [ ] Out-of-range / malformed value -> 400/422
- [ ] Boundary values (empty, max length, zero, negative)

### Authorization

- [ ] Unauthenticated -> 401
- [ ] Authenticated but wrong tenant/owner -> 404/403
- [ ] Privilege escalation attempt blocked

### State & concurrency

- [ ] Idempotent retry produces one effect
- [ ] Concurrent writes don't corrupt state (use the authorized race-testing lane in `testing`)
- [ ] Unique-constraint / conflict path -> 409

### Failure handling

- [ ] Downstream dependency error surfaces correctly (no silent swallow)
- [ ] Transaction rolls back on partial failure
- [ ] Timeout / retry behavior

## Non-functional

- [ ] Coverage target: <e.g. >= 85% lines on changed files>
- [ ] No flakiness across 3 consecutive CI runs

## Proof

- Command(s) to run the suite:
- Coverage report location:
- CI job(s) that gate merge:
