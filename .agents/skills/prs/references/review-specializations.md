# Review Specializations

Five focused review lenses for PR quality. Use each lens independently or combine via the `review-pr` command or `pr-reviewer` agent.

## Lens 1 — Code Quality

**Focus:** project conventions, correctness, and bug detection.

**Apply when:** reviewing any diff, especially before committing or opening a PR.

**What to check:**

- CLAUDE.md and project-local rules (import style, framework conventions, naming)
- Logic errors, null-handling, race conditions, memory leaks
- Security vulnerabilities (injection, trust boundary violations, leaked credentials)
- Duplicate logic and unnecessary abstractions

**Confidence scoring:** only surface issues with confidence ≥ 80. Rate each finding 0–100:

- 76–90: important, requires attention
- 91–100: critical — CLAUDE.md violation or confirmed bug

**Output:** findings ordered by severity, each with file:line, concrete risk, and fix suggestion.

---

## Lens 2 — Silent Failure Detection

**Focus:** error handling that suppresses, hides, or misreports failures.

**Apply when:** the diff touches try/catch blocks, error callbacks, fallback logic, optional chaining, or retry patterns.

**What to check:**

- Empty or overly broad catch blocks that swallow unrelated errors
- Errors logged but execution continues without user feedback
- Fallback behavior that masks the underlying failure silently
- Missing error IDs for production tracking
- Optional chaining (`?.`) that skips operations whose failure would matter

**Severity tiers:**

- CRITICAL: silent failure, broad catch hiding unrelated errors
- HIGH: poor error message, unjustified fallback, missing logging context
- MEDIUM: catch block more specific but still too wide, missing error ID

**Output:** per finding — location, severity, hidden error types, user impact, recommended fix with corrected code example.

---

## Lens 3 — Test Coverage

**Focus:** behavioral coverage gaps that would allow regressions to ship silently.

**Apply when:** the PR adds or modifies functionality, or after writing new code.

**What to check:**

- Critical code paths and error conditions without tests
- Missing boundary and edge cases for validation logic
- Negative test cases absent
- Tests that are coupled to implementation detail rather than behavior (they pass after refactor but fail to catch real regressions)
- Concurrent or async behavior not covered

**Priority rating (1–10):**

- 9–10: must add — data loss, security, or system failure risk
- 7–8: should add — user-facing errors possible
- 5–6: consider — minor confusion or edge-case bugs
- below 5: optional

**Output:** summary → critical gaps (≥8) → important improvements (5–7) → test quality issues → positive observations.

---

## Lens 4 — Comment Accuracy

**Focus:** documentation that will rot, mislead, or contradict the code as it evolves.

**Apply when:** the diff adds or modifies comments, docstrings, or inline docs.

**What to check:**

- Claims that don't match the current implementation (wrong parameter names, return types, behavior descriptions)
- Comments that restate what the code already says (add no value)
- TODOs and FIXMEs that have already been resolved
- Temporal comments ("added for the Y flow", "see issue #123") that belong in commit messages, not the file

**Output:** critical issues (factually wrong or misleading) → improvement opportunities → recommended removals → positive findings. Advisory only — do not modify code.

---

## Lens 5 — Type Design (typed languages only)

**Focus:** types that allow invalid states or fail to express invariants.

**Apply when:** the PR introduces new types, data models, or significant type refactors.

**What to check:**

- Invariants enforced only through documentation rather than structure
- Mutable internals exposed without guards
- Missing construction-time validation
- Anemic types with no behavior and no expressed constraints
- Types that can represent invalid combinations of values

**Ratings (1–10):** encapsulation, invariant expression, usefulness, enforcement.

**Output:** per type — identified invariants, four ratings with justification, strengths, concerns, recommended improvements.

---

## Combining Lenses

For a full pre-merge review, apply lenses in this order:

1. Code Quality — always
2. Silent Failure Detection — if error handling changed
3. Test Coverage — if new functionality added
4. Comment Accuracy — if docs or comments changed
5. Type Design — if new types added

Findings from different lenses are independent. Synthesize with: critical blockers first, important issues second, suggestions last. Positive observations help authors understand what is working.

See the `review-pr` command and `pr-reviewer` agent for orchestrated execution.
