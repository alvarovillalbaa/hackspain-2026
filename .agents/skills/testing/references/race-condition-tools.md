# Race Condition Tools

Use this reference when selecting tools for synchronized parallel requests, TOCTOU validation, session races, or state verification during an authorized pentest.

## Tool categories

| Category | Primary tools | Use cases |
| --- | --- | --- |
| Timing-synchronized proxy tooling | Turbo Intruder, Burp Repeater | Single-packet attack, last-byte synchronization, precise replay of captured requests |
| Async HTTP harnesses | Python `aiohttp`, Python `httpx` | Reproducible concurrent submissions, HTTP/2 multiplexing, custom auth or cookie handling |
| Threaded replay | Python `requests` with `threading.Barrier` | Low-overhead synchronized starts for replaying captured requests |
| Shell concurrency | GNU `parallel`, `xargs`, `curl` | Fast exploratory tests for simple endpoints when a full harness is unnecessary |
| State verification | Polling endpoints, database visibility, server logs | Confirm duplicate success, stale-state acceptance, oversell, or lock contention |

## Tool selection guidance

### Turbo Intruder

Use when the race window is narrow and success depends on microsecond-level synchronization.

Good fits:
- Coupon or voucher redemption limits
- Inventory purchase on scarce items
- Balance-transfer or credit-consumption races
- Approval or state-transition actions that must land at nearly the same time

Prefer single-packet or last-byte synchronization when ordinary concurrency misses the window.

### Burp Repeater

Use for request capture, token inspection, and manual replay before moving to synchronized tooling.

Good fits:
- Establishing the exact request that mutates state
- Verifying anti-CSRF material, cookies, and hidden fields
- Confirming single-request behavior before scaling to parallel runs

### Python `aiohttp`

Use when you need a repeatable async harness with explicit concurrency and session handling.

Good fits:
- Multi-endpoint TOCTOU where one request checks state and another consumes it
- Parallel submissions with custom cookie, header, or token rotation
- Repeated runs to measure reliability and success rate

### Python `httpx`

Use when HTTP/2 multiplexing on a single connection may improve synchronization or reproduce the application's real transport behavior.

Good fits:
- HTTP/2-enabled APIs
- Single-connection parallelism experiments
- Comparing HTTP/1.1 versus HTTP/2 race reliability

### Python `requests` with `threading.Barrier`

Use when the endpoint is simple and you want a lightweight synchronous harness.

Good fits:
- Session races such as password change plus privileged action
- Token rotation or refresh races
- Quick reproduction of captured POST requests without full async scaffolding

### GNU `parallel`, `xargs`, and `curl`

Use for exploratory checks where each request is simple and you want a fast answer before investing in a fuller harness.

Good fits:
- Quota or one-time action tests
- Simple JSON or form POST endpoints
- Coarse concurrency checks in an approved sandbox

Do not treat shell-based concurrency as definitive if the window appears narrow; switch to Turbo Intruder or a scripted harness for confirmation.

## State verification guidance

- Record the target state before every run: balance, coupon status, inventory count, approval state, token set, or vote count
- Prefer an application-visible verification endpoint first, then corroborate with logs or database visibility if that access is in scope
- Distinguish duplicate request acceptance from duplicate business effect; a finding matters when state changes more times than intended
- Capture response status, body, timing, and resulting state for each request batch

## Minimal task-to-tool mapping

- **Single-endpoint duplicate action**: Turbo Intruder first; fall back to `aiohttp` for repeatable measurement
- **Multi-endpoint TOCTOU**: `aiohttp` or `httpx` with explicit sequencing and concurrency control
- **Session race**: threaded Python harness with independent sessions or token sets
- **HTTP/2 race**: `httpx` with HTTP/2 enabled
- **Quick exploratory burst**: GNU `parallel` or `xargs` with `curl`
- **Impact confirmation**: application state checker, logs, or approved database visibility
