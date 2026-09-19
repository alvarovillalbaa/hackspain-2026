# Business Logic Workflows

Use this reference when the target risk depends on intended behavior rather than a generic sink or unsafe primitive. These tests are about proving that server-side workflow enforcement, business constraints, or state transitions can be bypassed.

Use [race-condition-workflows.md](./race-condition-workflows.md) alongside this reference when the core question is whether concurrent legitimate requests can defeat those constraints.

## Prerequisites

### Authorization and setup

- Written authorization that explicitly permits business-logic testing
- Test accounts at each relevant privilege tier, such as user, admin, approver, premium, or partner
- Sandbox payment methods or provider test mode for checkout and billing flows
- Seeded test data for products, coupons, balances, referrals, and approval chains
- Rollback plan for orders, uploads, account mutations, credits, and other stateful side effects

### Working environment

- Proxy every workflow through Burp or mitmproxy so each step is captured
- Use browser automation when the flow is too long or timing-sensitive to replay manually
- Preserve exact request and response pairs for each state transition you intend to violate

## Core workflow

1. **Workflow mapping**: Enumerate multi-step flows such as checkout, registration, onboarding, approvals, password reset, subscriptions, coupon redemption, and file submission. Identify every step, token, precondition, and terminal outcome.
2. **Rule extraction**: List the business constraints enforced by the workflow: price, quantity, role, time window, approval order, usage limits, allowed file types, or payment state.
3. **State-machine abuse**: Replay, skip, reorder, or repeat steps to determine whether the server validates step ordering and prerequisite completion.
4. **Data-integrity abuse**: Mutate business-critical fields such as price, quantity, discount, currency, account type, or approval status and verify whether server-side validation prevents unsafe states.
5. **Limit bypass**: Exercise one-time or rate-limited actions in parallel or across account boundaries to test coupon reuse, referral loops, vote stuffing, free-trial resets, or inventory abuse.
6. **Timing and race checks**: Probe for single-endpoint double-spend, duplicate order, multi-endpoint TOCTOU, approval race, or stale-state conditions where parallel legitimate requests defeat intended controls.
7. **Upload and submission logic**: Test unexpected file types, double extensions, oversized files, metadata abuse, filename traversal, and polyglot content where uploads are part of a business process.
8. **Payment manipulation**: Validate totals, discounts, tax, quantity, and currency across every stage of checkout and confirmation, using provider test mode only.

## WSTG-BUSL coverage

| WSTG ID | Test | What to verify |
| --- | --- | --- |
| WSTG-BUSL-01 | Business Logic Data Validation | Server-side validation of price, quantity, balance, entitlement, and business-state fields |
| WSTG-BUSL-02 | Ability to Forge Requests | Hidden fields, extra parameters, direct object references inside business flows |
| WSTG-BUSL-03 | Integrity Checks | Totals, signatures, checksums, or server recalculation of business-critical values |
| WSTG-BUSL-04 | Process Timing | Race conditions, stale-state approval, duplicate actions, double-spend patterns |
| WSTG-BUSL-05 | Function Limit Use | One-time action limits, quota resets, coupon reuse, referral abuse |
| WSTG-BUSL-06 | Circumvention of Work Flows | Step skipping, direct final-step access, step reordering, replay of completed flows |
| WSTG-BUSL-07 | Defenses Against Misuse | Abuse through nominally valid features rather than malformed input |
| WSTG-BUSL-08 | Upload of Unexpected File Types | Content-type mismatch, extension bypass, empty or oversized submissions |
| WSTG-BUSL-09 | Upload of Malicious Files | Polyglots, server-processed uploads, metadata or filename abuse |
| WSTG-BUSL-10 | Payment Functionality | Price manipulation, discount stacking, currency confusion, confirmation replay |

## Attack patterns

### Workflow circumvention

Test whether the server enforces step ordering and prerequisite completion.

- Access step `N` directly without completing steps `1..N-1`
- Replay a final-step request with only partial session state
- Reorder steps and observe whether the server reconstructs or rejects the flow
- Replay an already completed workflow to duplicate an outcome
- Remove, replace, or stale-reuse workflow state tokens

### Request forgery and integrity abuse

Test whether business-critical actions trust client-controlled state.

- Remove or tamper with CSRF tokens, hidden fields, or workflow identifiers
- Modify `price`, `quantity`, `discount`, `currency`, `role`, `account_type`, or `approval_status`
- Add extra fields to probe mass assignment in workflow endpoints
- Use duplicate parameters or parameter pollution to create conflicting values
- Switch identities or privileges mid-flow and test whether the server rebinds state safely

### Data validation abuse

Test server-side validation of business-critical fields.

- Negative values: `-1`, `-100`, `-0.01`
- Zero values: `0`, `0.00`, `0e0`
- Boundary values: maximum integers, large decimals, unexpected precision
- Type confusion: strings in numeric fields, arrays in scalars, booleans in enumerations
- Currency or locale confusion where the flow accepts multiple formats

### Function-limit and timing abuse

Test whether nominal action limits hold under concurrent or repeated use.

- Apply the same coupon or promo multiple times
- Create referral loops or self-referrals
- Repeat a vote, like, claim, or redemption beyond documented limits
- Reset counters via account recreation, session reset, or identity variation
- Send parallel requests to defeat inventory, quota, or approval constraints
- Race a validation or quote step against the later consume or submit step
- Trigger session refresh, role change, or token rotation in parallel with a dependent action
- Compare ordinary parallel replay with tighter synchronization when the window appears narrow

### File-upload logic abuse

Test uploads as part of a business flow, not just as unrestricted code execution sinks.

- Mismatched content type versus extension
- Double-extension or delimiter tricks such as `file.php.jpg`
- Zero-byte, oversized, or malformed file handling
- Polyglot files that pass validation but alter downstream business processing
- Filename traversal or metadata injection in downstream storage, review, or export flows

### Payment manipulation

Test payment and checkout integrity at each stage.

- Modify totals after the cart is priced but before payment is finalized
- Stack discounts that should be mutually exclusive
- Change quantity or currency between quote and capture
- Replay a successful payment confirmation against a new order
- Add or remove items after the server has calculated a final amount

## Reporting guidance

- Document the intended workflow before describing the bypass
- Record the exact server-side constraint that failed, not just the mutated parameter
- Include raw requests, sequence order, and account context for reproduction
- For concurrency findings, record the number of requests sent, the number of successful state changes, the synchronization method, and the observed success rate
- Quantify business impact such as financial loss, inventory corruption, unauthorized approvals, or policy bypass
- Keep speculative abuse chains separate from confirmed outcomes
