# Reviews and Comments

Treat review as technical evaluation, not social performance.

## Severity Scale

All reviewers and reviews use P0–P3:

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Critical breakage, exploitable vulnerability, data loss or corruption | Must fix before merge |
| **P1** | High-impact defect likely hit in normal usage, breaking contract | Should fix |
| **P2** | Moderate issue with meaningful downside (edge case, perf regression, maintainability trap) | Fix if straightforward |
| **P3** | Low-impact, narrow scope, minor improvement | Developer's discretion |

## Multi-Agent Code Review

For non-trivial diffs, spawn parallel reviewer sub-agents rather than doing a single-pass review. Each agent has tight scope and explicit "what you don't flag" rules to prevent duplicate findings.

### Always-on reviewers

Dispatch these for every review:

| Agent | Focus |
|-------|-------|
| `correctness-reviewer` | Logic errors, edge cases, null propagation, state bugs, broken error propagation |
| `architecture-strategist` | Layer violations, coupling, SOLID principles, structural decisions |

### Conditional reviewers

Add based on diff content:

| Agent | Select when... |
|-------|---------------|
| `adversarial-reviewer` | Diff ≥50 changed non-test lines, or touches auth, payments, data mutations, external APIs |
| `performance-oracle` | DB queries, data transforms, caching, async, or any O(n) data operation |
| `security-reviewer` | Auth, public endpoints, user input, permissions, secrets handling |

### Reviewer agents reference

Agent definitions live in `references/agents/`:
- `correctness-reviewer.md`
- `adversarial-reviewer.md`
- `performance-oracle.md`
- `architecture-strategist.md`

### Synthesis

After all agents complete:
1. Deduplicate findings across agents by file:line and issue type
2. Use the more conservative severity when agents disagree
3. Lead the report with P0/P1 findings across all reviewers before P2/P3

### Mode selection

| Mode | When to use |
|------|------------|
| **Report-only** | Read-only review pass, parallel with browser testing, no edits to checkout |
| **Autofix** | Apply clear P0/P1 fixes automatically; present residuals |
| **Interactive** | Default — review, apply safe fixes, present findings, ask about gated decisions |

---

## When Performing a Review

Lead with findings, ordered by severity. For each finding, include the file and line, the concrete risk, and why it matters. If no findings are present, say so explicitly and mention any residual testing or verification gaps.

When the output will feed another agent or a loop, prefer machine-parseable format:

```text
<category>/<severity> <path>:<line> -- <risk or issue> -> <expected fix>
```

Examples:

```text
correctness/P1 services/auth.py:42 -- unauthenticated path can bypass guard -> reject request before loading account
testing/P2 tests/test_auth.py:18 -- missing regression for empty token -> add failing case and rerun focused test
architecture/P1 src/payments.ts:77 -- view now owns retry logic that belongs in service layer -> move orchestration behind existing payment client
```

Narrative summary can follow after the findings. Findings come first.

## When Receiving Review Feedback

**Forbidden responses** — these are performative, not analytical:
- "You're absolutely right!" (agreement without verification)
- "Great point!" / "Excellent feedback!" (social noise)
- "Let me implement that now" (before verifying the issue exists)

**Required pattern instead:**
1. Read the complete feedback before changing anything
2. Restate unclear items in precise technical terms, or ask for clarification — do not implement before understanding
3. Verify whether the issue still exists in the current code
4. Push back with technical reasoning when the feedback is wrong for this repo
5. Implement one item at a time, re-verify after each

**When feedback is unclear:** Stop. Do not implement any items. Ask for clarification on the unclear ones before proceeding — partial understanding produces wrong implementations.

**Source-specific evaluation:**

| Feedback source | Approach |
|----------------|----------|
| Trusted team member / known partner | Implement after understanding; scope questions remain valid |
| External reviewer / automated tool | Apply skepticism: verify technical correctness, check for context gaps, confirm platform compatibility, assess whether the reviewer understands the full architecture before implementing |

Push back when suggestions: conflict with established architecture, assume incorrect context, violate YAGNI, or prove technically wrong for this stack. Stating "this would break X because Y" is preferable to silent non-compliance or performative acceptance.

**Implementation sequencing:** blocking P0/P1 issues first → simple mechanical corrections → complex refactoring. Test and verify after each item before moving to the next.

Do not use performative agreement in place of analysis. Technical acknowledgment or reasoned pushback — nothing else.

## Review Thread Hygiene

If the review platform supports inline replies, answer in the thread for line-specific comments. Use top-level comments only for cross-cutting discussion.

When fixing comments:
- cluster related comments
- fix blockers first
- re-run the narrowest relevant verification
- reply with the concrete change, not vague reassurance

## Bot Comments

Treat comments from Sentry, static analyzers, or CI bots as triage inputs.

- verify the comment is not stale
- inspect the exact file and line it references
- confirm the root cause before editing
- summarize what changed and what evidence supports the fix

## Adversarial Review (standalone)

When running a quick adversarial pass without the full multi-agent pipeline, dispatch a subagent using the `adversarial-reviewer` agent definition. The subagent has fresh context and no checklist bias from the structured pass.

Scale depth to diff size:
- **< 50 lines changed:** skip adversarial review — structured pass is sufficient
- **50–199 lines:** one adversarial pass
- **200+ lines:** full adversarial pass plus a structured review from a second model when available

**FIXABLE findings** flow into the Fix-First pipeline: fix them, commit, re-run tests.
**INVESTIGATE findings** are presented as informational — the developer decides.

### Multi-source synthesis

When more than one source ran (structured review + adversarial subagent + another model):

```
ADVERSARIAL REVIEW SYNTHESIS:
════════════════════════════════════════════════════════════
  High confidence (found by multiple sources): [agreed findings]
  Unique to structured review: [...]
  Unique to adversarial pass: [...]
════════════════════════════════════════════════════════════
```

High-confidence findings (agreed on by multiple sources) get priority treatment.

## Three-Agent Verification Trio

For critical changes (auth, payments, data destruction, or any review that surfaces ≥3 P0/P1 issues), escalate from a single adversarial pass to a three-agent trio that exploits sycophancy in controlled opposition:

**Agent 1 — Bug-finder** (incentivized to find)
Prompt: "Review this code. You will be scored: +1 for each low-impact issue, +5 for medium-impact, +10 for critical. Find everything. Report each finding with a score and your reasoning."
→ Produces the superset: every plausible problem, including false positives.

**Agent 2 — Adversarial Disprover** (incentivized to refute, penalized for errors)
Give it the bug-finder's output. Prompt: "For each reported finding, you score the bug-finder's points if you can disprove it, but lose 2× those points if you're wrong. Attempt to disprove each finding. Reason carefully before committing."
→ Aggressively filters the list. Real bugs survive; false positives get eliminated.

**Agent 3 — Referee** (neutral scorer)
Give it both outputs. Prompt: "I have the correct ground truth. Score both agents on each item: +1 for a correct call, −1 for incorrect. Emit a confidence classification (HIGH / MEDIUM / LOW) for each finding."
→ High-confidence findings require human inspection; medium and low can be triaged.

**When to use:** reserve for high-stakes diffs, not routine reviews. The trio is deliberately slow and token-intensive; its value is in the cross-check, not speed.

---

## GitHub Helpers

If the repo exposes `gh-address-comments`, use it for comment triage. If CI is failing, use `/fix-ci` to inspect the checks before guessing at fixes.
