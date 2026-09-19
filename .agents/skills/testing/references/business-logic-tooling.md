# Business Logic Tooling

Use this reference when selecting tools for multi-step workflow abuse, replay, timing, upload, or payment-integrity testing.

## Tool categories

| Category | Primary tools | Use cases |
| --- | --- | --- |
| Request manipulation | Burp Repeater, Burp Intruder, mitmproxy | Modify parameters, replay steps, tamper with hidden fields, test forged requests |
| Browser automation | Playwright, Selenium | Long UI workflows, approval chains, race setup, capture of network traffic from browser actions |
| Custom scripting | Python `requests`, `aiohttp`, `httpx` | Reproducible workflow abuse, parallel limit-bypass tests, HTTP/2 race tests, custom auth/session handling |
| Timing-synchronized replay | Turbo Intruder | Single-packet attack, last-byte sync, narrow-window race-condition validation |
| Shell concurrency | GNU `parallel`, `xargs`, `curl` | Fast exploratory concurrency tests for simple endpoints |
| File-upload testing | ExifTool, polyglot generators, crafted multipart requests | Type confusion, metadata abuse, double extension, malformed upload paths |
| Payment testing | Stripe test mode, PayPal sandbox, provider simulator tools | Safe checkout and billing manipulation without touching live funds |

## Tool selection guidance

### Burp Repeater

Use for low-volume, high-signal mutations where you need to understand the exact request that changes server behavior.

Good fits:
- Checkout totals and discount tampering
- Hidden-field or CSRF manipulation
- Final-step replay and step skipping
- Approval or role-gated action replay

### Burp Intruder

Use for controlled parameter variation, especially when testing business fields with boundaries or conflicting combinations.

Good fits:
- Price, quantity, and discount permutations
- Parameter-pollution checks
- Enumerating workflow-state token handling
- File metadata and multipart field variation

Keep request rates conservative unless the environment owner has approved higher concurrency.

### Turbo Intruder

Use when ordinary concurrency is too imprecise and the race window appears narrow.

Good fits:
- Single-use coupon or credit redemption
- Inventory oversell or last-item purchase
- Approval, privilege, or state-transition races
- Duplicate financial actions where timing determines success

Prefer this over generic replay when the finding depends on microsecond-level synchronization.

### mitmproxy

Use when you need to intercept and mutate traffic while exercising the real application flow in a browser or mobile client.

Good fits:
- Editing requests in the middle of a checkout flow
- Swapping values between steps without rebuilding the request manually
- Logging or modifying state tokens during browser automation

### Playwright or Selenium

Use when the workflow is lengthy, timing-sensitive, or dependent on client-side state setup.

Good fits:
- Registration, onboarding, or subscription flows
- Multi-role approval chains
- Building repeatable evidence for step-order or replay bugs
- Capturing browser-side behavior before switching to raw HTTP replay

Prefer Playwright for new harnesses because it is easier to instrument and replay deterministically.

### Python `requests`, `aiohttp`, and `httpx`

Use when you need lightweight reproducible harnesses without full browser overhead.

Good fits:
- Replay of captured requests with modified cookies or headers
- Parallel coupon, quota, or referral testing
- Race-condition validation with explicit concurrency control
- Serial execution of approval or payment-state transitions
- HTTP/2 multiplexed replay for race windows that behave differently on a single connection

Preserve session cookies and anti-CSRF material intentionally so the script models the real flow.

Prefer:
- `requests` plus a barrier for simple threaded replay
- `aiohttp` for flexible async concurrency and mixed endpoint sequencing
- `httpx` when HTTP/2 transport or connection reuse matters

### GNU `parallel`, `xargs`, and `curl`

Use for quick exploratory checks when each request is simple and the environment owner has approved the burst volume.

Good fits:
- Repeating a simple form or JSON submission
- Early confirmation that an endpoint is worth deeper race testing
- Low-complexity quota or one-time action checks

Switch to Turbo Intruder or scripted replay before calling a narrow race confirmed.

## Safe execution notes

- Keep all traffic inside an authorized staging or sandbox environment
- Prefer provider test modes for billing, credits, refunds, and subscription changes
- Use seeded accounts and data so cleanup is straightforward
- Confirm rollback steps before testing orders, balances, approvals, uploads, or irreversible state changes
- Capture enough evidence to replay the issue without re-running noisy tests unnecessarily

## Minimal task-to-tool mapping

- **Workflow bypass**: Playwright to establish state, then Burp Repeater or Python replay for direct final-step access
- **Request forgery**: Burp Repeater or mitmproxy for hidden fields, CSRF, and parameter-pollution checks
- **Limit bypass**: `aiohttp` or Burp Intruder with conservative concurrency and explicit stop conditions
- **Timing/race issues**: Turbo Intruder for tight windows, or parallel Python harnesses for repeatable measurement
- **File upload logic**: crafted multipart requests, metadata tooling, and safe polyglot samples in sandbox only
- **Payment integrity**: Burp Repeater plus provider test mode; never use live payment instruments
