# Agentic Dev Session Example: plan → code → test → verify

A worked trace of an agent landing one small story end to end. Use it as a
model for how a disciplined agentic loop is structured and how each phase
hands off to the next.

## Task

> Add a `GET /health` endpoint that returns `{ "status": "ok", "uptime": <s> }`
> and is covered by a test.

## 1. Plan

The agent restates the goal and writes acceptance criteria before touching code:

- [ ] `GET /health` returns HTTP 200
- [ ] Body is `{ "status": "ok", "uptime": <number> }`
- [ ] A test asserts status code and body shape
- [ ] Existing tests still pass

Smallest slice: one route + one test. No middleware, no metrics — out of scope.

## 2. Code

```js
// src/routes/health.js
const startedAt = Date.now();

export function healthRoute(app) {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: Math.floor((Date.now() - startedAt) / 1000) });
  });
}
```

Wired into the app entrypoint. The agent makes the minimal change and stops —
it does not refactor the router or add unrelated cleanup.

## 3. Test

```js
// test/health.test.js
import request from "supertest";
import { app } from "../src/app.js";

test("GET /health returns ok with uptime", async () => {
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
  expect(typeof res.body.uptime).toBe("number");
});
```

## 4. Verify

```
$ npm test -- health
PASS  test/health.test.js
  ✓ GET /health returns ok with uptime (24 ms)

$ npm test
Test Suites: 8 passed, 8 total
Tests:       42 passed, 42 total
```

Acceptance criteria walked one by one:

- [x] Returns 200 — asserted
- [x] Body shape correct — asserted
- [x] Test added — `test/health.test.js`
- [x] No regressions — full suite green

## 5. Land

Single focused commit, message describing the behavior change. Preserve only
the verification evidence needed for the handoff; do not automatically capture
tool inputs or transcripts that may contain private data.

## What made this a good loop

- Acceptance criteria written *before* code, then checked off explicitly.
- One story, smallest slice; no scope creep.
- Verification ran the real test suite, not just the new test.
- The agent stopped when the criteria were met instead of polishing.
