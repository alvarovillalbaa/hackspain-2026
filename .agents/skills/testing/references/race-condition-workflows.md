# Race Condition Workflows

Use this reference when the suspected weakness depends on concurrent legitimate requests, stale reads, or a check-then-act gap rather than malformed input.

These workflows commonly map to WSTG-BUSL-04 and WSTG-BUSL-05, but they often deserve their own treatment because timing, synchronization, and state verification determine whether the finding is real.

## Prerequisites

### Authorization and setup

- Written authorization that explicitly permits concurrency testing
- Approved request burst volume and stop conditions
- Seeded test accounts, balances, coupons, inventory, or approval objects that can be safely consumed
- Rollback plan for financial, quota, and state-mutating side effects
- Separate authenticated sessions, cookies, or tokens when the scenario requires parallel actors

### Working environment

- Capture the canonical request in Burp or another proxy before building a harness
- Verify the target's normal single-request behavior before sending parallel traffic
- Record baseline state before every attempt so duplicate effects are measurable
- Preserve exact concurrency settings, transport mode, and timing notes for reproducibility

## Target identification

Look for operations where the server should allow an outcome exactly once or should make a decision against current state.

Common targets:
- Coupon redemption, referrals, gift-card use, and credit consumption
- Inventory purchase, reservation, waitlist promotion, and ticket claims
- Balance transfer, withdrawal, credit deduction, or wallet debit
- Vote, like, follow, claim, or reward endpoints with documented limits
- Approval, entitlement, or role changes tied to subsequent privileged actions
- Token generation, session refresh, password reset, or email-change workflows

Indicators in source or traffic:
- Check-then-act flows split across two endpoints
- `SELECT` followed by `UPDATE` without obvious locking
- Single-use or limited-use actions enforced only at the application layer
- Separate "preview", "quote", "validate", or "check" endpoints followed by a mutating "apply", "buy", or "submit"

## Core workflows

### Single-endpoint limit overrun

Use when one request should succeed at most once but multiple simultaneous copies may all pass validation.

1. Record baseline state such as coupon status, balance, remaining inventory, or count.
2. Capture one canonical request that performs the action.
3. Replay the same request concurrently at a conservative but meaningful concurrency level.
4. Compare final state and count how many actions actually took effect.
5. Repeat with adjusted synchronization if the result is inconsistent.

Typical targets:
- Same coupon applied multiple times
- Same balance transferred more than once
- Last-item purchase accepted multiple times
- Vote or claim action counted repeatedly

### Multi-endpoint TOCTOU

Use when one endpoint validates a condition and another consumes the result or mutates state after a gap.

1. Identify the check step and the use step.
2. Confirm the check result is accepted under normal conditions.
3. Send the use request immediately after or alongside the check response window.
4. Increase precision or parallelism until the stale-state window is exercised.
5. Verify whether the final state violates the intended rule.

Typical targets:
- Validate coupon then apply coupon
- Check balance then transfer funds
- Quote price then capture order after cart mutation
- Check approval status then perform privileged action

### Session-level race

Use when session invalidation, role changes, or token rotation may not be atomic across concurrent requests.

1. Prepare independent sessions or tokens representing the relevant actors or pre-change state.
2. Trigger the state-changing action and the dependent privileged action in parallel.
3. Verify whether the dependent action still executes under stale session or privilege state.
4. Confirm whether both old and new tokens remain valid simultaneously.

Typical targets:
- Password change plus privileged action
- Role downgrade plus admin action
- Session refresh plus token rotation
- Email change plus password reset delivery

### Database-backed race

Use when the flaw appears to depend on missing row-level locking, optimistic concurrency gaps, or stale reads.

1. Identify the record or resource whose state gates the action.
2. Trigger parallel operations that contend on the same row or logical object.
3. Observe whether more actions succeed than the business rule allows.
4. If approved and available, corroborate with database state, lock behavior, or deadlock logs.
5. Separate application race outcomes from transport retries or duplicate client submission artifacts.

## Timing and synchronization techniques

- **Single-packet attack**: send many requests in one packet when the timing window is extremely small
- **Last-byte sync**: hold back the final byte of each request, then release all final bytes together
- **HTTP/2 multiplexing**: send many requests on one connection to reduce connection variance
- **Connection warming**: establish connections and sessions first, then fire the requests in parallel
- **Barrier-based start**: synchronize application threads or async tasks so they begin at the same instant

Start with the least noisy method that is likely to work. Move to tighter synchronization only if the target appears race-prone but the window is narrow.

## Reporting guidance

- Document the exact business rule or state invariant that failed
- Record the concurrency level, transport mode, synchronization method, and success rate
- Show before-and-after state, not only HTTP responses
- Quantify impact as duplicate redemption, oversell, over-withdrawal, stale privilege use, or similar business outcome
- Separate a flaky reproduction from a deterministic finding, but still report success-rate data when the race is real
