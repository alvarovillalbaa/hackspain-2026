---
name: prs
description: Pull request management for teams of any size — PR workflow, review queues, merge policy, branch strategy, review SLAs, CI gating, and merge-conflict handling.
metadata:
  short-description: Manage PR flow, review queues, merge policy, and conflict handling
---

# PR Management

Use this skill for pull request operations and process design across an engineering team.

This skill covers both:

- **system design**: how a team should run PR review, routing, CI, and merge policy
- **operational execution**: how to triage active PRs, resolve straightforward conflicts, and decide when human judgment is required

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `deslop`: Remove AI-generated code slop from the current diff without changing behavior. Install: `python3 scripts/install-external-skills.py --skill deslop --agent codex`.
- `thermo-nuclear-code-quality-review`: Run an unusually strict maintainability and abstraction-quality review. Install: `python3 scripts/install-external-skills.py --skill thermo-nuclear-code-quality-review --agent codex`.
- `no-mistakes`: Gate explicit ship, push, PR, or validate flows through the no-mistakes pipeline. Install: `python3 scripts/install-external-skills.py --skill no-mistakes --agent codex`.
- `improve`: Run a read-only senior codebase audit and write execution-ready plans for other agents. Install: `python3 scripts/install-external-skills.py --skill improve --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Use this skill for

- defining PR workflow and merge policy
- improving review throughput and queue health
- reducing PR size, review latency, or merge risk
- setting ownership, routing, and reviewer expectations
- designing branch strategy and release interaction with PR flow
- building PR metrics, dashboards, and operating reviews
- diagnosing why reviews stall, churn, or pile up
- triaging large PR queues for teams of 50-200+ engineers
- resolving straightforward merge conflicts non-interactively

## Core model

Manage pull requests at five levels — always start at intent:

- **Intent level**: what is this PR actually trying to do for a human? (recover this in plain language before evaluating anything else)
- **PR level**: size, clarity, test evidence, risk, reviewability
- **Reviewer level**: ownership, load, response time, quality bar
- **Queue level**: backlog, aging, bottlenecks, merge throughput
- **System level**: policy, CI gates, branching, release cadence, accountability

If the user only wants one level, still check whether the adjacent level is causing the problem.

For active PR operations, reason in this order:

1. what is the PR trying to do for a human (recover the plain-language intent, do not repeat jargon from the PR description)
2. whether the implementation actually solves that underlying problem — not just whether it compiles or matches the ticket
3. whether it can keep moving autonomously, or needs to close or escalate
4. what operating action is needed next

Do not confuse "diff exists" with "progress exists." A PR that compiles but does not solve the underlying problem is still a flow failure. An unclear PR is treated the same as a wrong-shaped fix for triage purposes — close it rather than passing it to a human reviewer without a clear intent to evaluate.

## Standard output structure

Unless the user asks for a different artifact, produce:

### 1. Current state

- what the existing PR flow is
- where delay or risk shows up
- what team scale or topology matters

### 2. Problem diagnosis

- review latency
- oversized PRs
- unclear ownership
- flaky or slow CI
- merge conflicts or release friction
- approval quality or rubber-stamping

### 3. Recommended operating model

- author expectations
- reviewer expectations
- merge rules
- escalation path
- exceptions policy

### 4. Metrics

- what to measure
- target threshold or SLA
- what action to take when a metric goes out of bounds

### 5. Rollout plan

- immediate changes
- policy changes
- tooling or automation needs
- communication and adoption steps

### 6. Risks and tradeoffs

- what improves
- what gets stricter or slower
- where the process may overfit team size or repo shape

## Recommended metrics

Prefer a small set of operationally useful metrics:

- time to first review
- time to approval
- time to merge
- PR size by lines changed or files touched
- rework loops per PR
- review queue age
- CI failure rate
- merge-blocked count
- merge-conflict rate

Do not stop at reporting. Pair every metric with an action threshold.

## Default policy components

When the user asks for a PR process and does not supply one, cover these defaults:

- PR description must explain why, not only what changed
- PRs should be small enough to review in one sitting
- authors own test evidence and rollout notes
- reviewer assignment should follow clear ownership or rotation
- stale PRs need explicit nudges or escalation
- CI gates should block merge on correctness, not on noise
- emergency paths should exist but be auditable
- straightforward merge conflicts may be resolved autonomously; judgment-heavy conflicts must escalate

## Triage lane for active PRs

Use this lane when the user is managing an active queue, reviewing many PRs, or asking how to operationalize landing flow for a large engineering team.

### Step 1. Process each item independently

- do not let one PR's framing leak into another
- if triaging a queue, treat each PR, issue, or raw problem statement as its own decision

### Step 2. Recover the plain-language intent

Before judging a PR, restate what it is actually trying to do for a human.

- do not blindly repeat technical wording from the PR description
- translate technical changes into user or operator impact
- if the intent is unclear, treat that as a real quality problem

### Step 3. Judge the solution, not just the diff

Ask:

- does this implementation solve the underlying problem
- is it a durable fix or a local patch
- is extra behavior or special-case logic being introduced unnecessarily

Classify the result:

- **continue**: good enough to keep moving autonomously
- **close**: wrong-shaped, too local, or too unclear to continue
- **escalate**: needs a real product, architectural, or policy judgment from a human

### Step 4. Distinguish bug, feature, and maintenance paths

Choose the validation lane deliberately.

**Bug path:**
- Reproduce the failure with the smallest credible test
- Temporarily ablate the fix locally (never commit, never push) to confirm the test fails on the broken state
- Restore the fix and rerun to confirm the test now passes
- If the bug cannot be reproduced, or the fix does not change the outcome, escalate

**Feature path:**
- Run the smallest credible check that shows the feature works as intended
- For maintenance, tooling, docs-only, and lockfile-only PRs: decide whether bespoke local testing is needed or whether normal CI is the meaningful validation

**In both cases:** if the claimed change cannot actually be validated, escalate instead of continuing into review or CI as if the work were proven.

### Step 5. Handle superficial cleanup before review

If the PR is directionally correct but still messy:

- chain to `deslop` for AI-code residue, unnecessary comments, casts, or abnormal defensive checks
- chain to `thermo-nuclear-code-quality-review` when the mess is structural: special-case branching, shallow abstractions, file bloat, or wrong-layer logic
- keep any resulting edits minimal and readable

If the PR needs a fundamental reframe, escalate instead of polishing around the edges.

### Step 6. Review and CI in a fixed order

For PRs that stay on the autonomous lane:

- address existing valid review feedback first
- run fresh review against the current base, not stale assumptions
- treat blocking review findings as merge blockers
- fix related CI failures before handoff
- do not keep looping on non-blocking polish if the PR is otherwise sound

### Step 7. Re-check base drift before final handoff

Before landing or final escalation:

- confirm the branch still applies cleanly to current base
- if new conflicts are straightforward, resolve and re-run the final validation path
- if new conflicts are judgment-heavy, escalate

## Merge conflict lane

Use this lane when the user needs merge-conflict handling itself, or when merge friction is materially affecting throughput.

### Requirements and constraints

- operate from the repository root; if not in a Git repo, stop and report
- do not ask the user for input when the conflict is straightforward
- choose sensible defaults and explain them briefly
- prefer minimal, correct changes that preserve both sides' intent when possible
- use non-interactive flags for any tools invoked
- do not push or tag as part of the resolution procedure

### Resolution workflow

#### 1. Detect conflicts

- run `git status --porcelain`
- collect files with unmerged statuses
- also check for conflict markers such as `<<<<<<<`, `=======`, and `>>>>>>>`

#### 2. Resolve per file

Open each conflicting file and remove conflict markers.

Merge both sides logically when feasible. If the versions are mutually exclusive, prefer the variant that:

- compiles and passes type checks
- preserves public APIs and expected behavior
- keeps module boundaries and imports consistent

#### 3. Apply language-aware strategy

- `package.json`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`: merge conservatively and prefer regenerating lockfiles instead of hand-editing them
- config files: preserve the union of safe settings; avoid dropping required fields
- generated files and build artifacts: prefer keeping them out of version control where possible; otherwise prefer the current branch unless project guidance says otherwise
- text and markdown: include both unique content and deduplicate headings or repeated prose
- binary files: prefer current branch unless repo policy says otherwise

#### 4. Validate

After resolving conflicts:

- install dependencies if manifests changed
- run the narrowest credible lint, typecheck, build, and test sequence for the affected stack
- if other ecosystems are present, run their normal verification path when available

If ambiguity remains and one option blocks the build while another compiles and tests cleanly, prefer the variant that keeps the repo green.

#### 5. Finalize

- re-scan for conflict markers to confirm none remain
- stage resolved files and regenerated lockfiles
- summarize which files were touched and the notable resolution choices

### Merge-conflict operating guidance

When merge conflicts are a recurring team problem, inspect:

- branch age before merge
- PR size and overlap
- ownership hot spots
- lockfile churn
- release-branch coupling

Do not treat conflict count as a purely local author problem if the real cause is system-level overlap or branch policy.

## Landing gates

A PR is ready to land only if all of these are true:

- [ ] Plain-language intent is clear
- [ ] Implementation serves that intent in a real way — not symptom-only
- [ ] Branch applies cleanly to current base, or conflicts were resolved and revalidated
- [ ] Bug was reproduced and shown fixed, or feature was tested directly
- [ ] No fundamental refactor required
- [ ] No human framing or architectural judgment still required
- [ ] Review ran against fresh base; no unresolved P0 or P1 findings
- [ ] CI is green, or remaining failures are clearly unrelated to the PR

Apply these gates before declaring a PR "ready for landing." Do not skip gates under time pressure; each exists because skipping it has caused past failures.

## Review specializations

For deep pre-merge review, apply these five lenses from `references/review-specializations.md`:

| Lens | Apply when |
|------|-----------|
| Code Quality | always — any diff; use `deslop` or `thermo-nuclear-code-quality-review` for the actual methodology |
| Silent Failure Detection | diff touches error handling, catch blocks, fallback logic |
| Test Coverage | new or modified functionality |
| Comment Accuracy | new or modified comments or docs |
| Type Design | new types or data models (typed languages only) |

See the `review-pr` command and `pr-reviewer` agent for orchestrated execution. See `references/triage-protocol.md` for the full intent-first triage protocol.

## Team-scale guidance

Adjust the workflow by scale:

- **1-10 engineers**: favor lightweight rules, high trust, fast merge, minimal ceremony
- **10-50 engineers**: add reviewer routing, SLA expectations, and better queue visibility
- **50-200 engineers**: formalize ownership, exceptions, merge policy, triage lanes, and reporting
- **200-1000+ engineers**: treat PR management as an operational system with dashboards, automation, explicit governance, and human-judgment checkpoints

Do not recommend enterprise-heavy policy for a tiny team unless the user explicitly wants it.

## Diagnosis heuristics

If PRs are slow:

- inspect PR size first
- then reviewer load
- then CI duration and flakiness
- then ownership ambiguity
- then merge-conflict frequency or stale branch hygiene

If review quality is weak:

- inspect incentives and expectations
- inspect whether reviewers have context and authority
- inspect whether PRs are too large to review properly

If merge risk is high:

- inspect test gates
- inspect branch age and merge frequency
- inspect release coupling and hotfix paths
- inspect how the team handles merge conflicts today

If many PRs should not keep moving:

- inspect whether the queue lacks a clear close-versus-escalate decision
- inspect whether reviewers are commenting on code that should have been rejected earlier
- inspect whether unclear PR intent is clogging the lane

## Suggested thresholds

If the user does not provide thresholds, propose defaults such as:

- `time to first review > 24h`: rebalance review routing or backup reviewer coverage
- `time to merge > 3 business days` for normal PRs: inspect queue load, CI time, and PR sizing
- `PR size > 500 lines changed`: challenge reviewability unless justified
- `conflict rate rising for 2+ consecutive periods`: inspect branch freshness and ownership overlap
- `related CI failure rate > 10%`: stabilize the pipeline before optimizing throughput

Every threshold should map to a concrete action, not just a dashboard color.

## Failure modes to avoid

- solving queue problems with only more reminders
- adding approval layers without fixing ownership
- strict policy that collapses under exceptions
- measuring throughput without measuring merge quality
- forcing tiny-team process onto large organizations or vice versa
- treating CI pain as a people problem
- resolving judgment-heavy conflicts autonomously when the final shape is unclear
- spending review effort on PRs that should have been closed or escalated earlier
- using merge-conflict counts without diagnosing why overlap is happening

## Quality bar

- The workflow is explicit enough to run.
- The metrics are tied to decisions, not vanity.
- Tradeoffs are named clearly.
- The recommendation fits the team size and repo reality.
- The triage lane distinguishes continue, close, and escalate clearly.
- The merge-conflict lane is concrete enough to execute non-interactively on straightforward cases.
- Landing gates are checked before any PR is declared ready.
- Review lenses are applied to the diff, not the whole codebase.

## Related

**Agents:**
- `agents/pr-reviewer.md` — multi-lens pre-merge review
- `agents/pr-triage.md` — intent-first queue triage

**Commands:**
- `commands/review-pr.md` — run a review on a diff, branch, or PR number
- `commands/triage-prs.md` — triage a queue or set of PRs

**References:**
- `references/review-specializations.md` — five review lenses with outputs and triggers
- `references/triage-protocol.md` — step-by-step triage flow with landing gates and comment templates
- `references/code-review-checklist.md` — 10-category PR review checklist, pre-review commands, approval thresholds, multi-agent (5-lens parallel) review workflow
- `../agentic-development/references/reviews-and-comments.md` — adversarial review and comment format
