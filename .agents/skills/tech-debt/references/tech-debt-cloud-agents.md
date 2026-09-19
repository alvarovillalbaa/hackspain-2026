# Tech Debt with Cloud Agents

Technical debt accumulates because addressing it competes with feature work for the same engineering hours — and features usually win. Cloud agents change this economics: debt work can run outside the existing pool of engineering time, in parallel, on its own schedule, without a human at the keyboard.

**Core insight:** Debt elimination becomes a scoping question, not a prioritization question. Which debt items have clear enough success criteria to hand off to an agent, and which still need human judgment?

## When to Use This Approach

Debt work is agent-ready when:
- Success criteria are binary and verifiable (tests pass, lint clean, coverage percentage)
- The change pattern is repetitive across many files
- The task doesn't require product judgment (no UX, no API contract changes)
- The output is a PR that a human can review

Debt work still needs humans when:
- The decision requires understanding user impact
- The fix changes observable behavior or external contracts
- There's no automated way to verify correctness

## Four Capabilities That Matter

**Autonomy** — the agent runs in its own environment without anyone at the keyboard. Teams start sessions and come back to completed PRs.

**Parallelism** — run many agent sessions at once, one per module, one per error, one per flag. Batch throughput that would take weeks lands in hours.

**Scheduling** — wire debt cadences to cron, Linear labels, Slack commands, or CI events. Maintenance runs on its own clock, not the sprint's.

**Long horizons** — the agent maintains state and adapts across dozens of sessions. Multi-week modernization work that previously got derailed by feature priorities becomes tractable.

---

## The 9 Cloud-Agent Debt Patterns

### 1. Large-Scale Migrations

**Use case:** JavaScript → TypeScript, REST → GraphQL, MongoDB → Postgres, Angular 16 → 18, ORM version upgrades.

**Pattern:**
1. One scoping session identifies the migration surface and conflict-free work packages.
2. A shared playbook defines the mechanical transformation and success criteria for each package.
3. Parallel sessions — one per package — execute against the playbook.
4. PRs land over the following days; engineers review, not rewrite.

**Success criteria:** every package passes the shared test gate and the type/lint check; no shared-state conflicts between parallel sessions.

**Orchestration hint:** use the `/orchestrate` command with the planner/worker model. Give the planner the playbook and the scope; workers execute each package in isolation.

---

### 2. Dependency Currency

**Use case:** weekly dependency maintenance instead of periodic emergency updates.

**Pattern:**
- Schedule a weekly session (Monday morning or equivalent).
- Patch and minor bumps: batched into a single PR with test results attached.
- Major-version bumps: one PR per package, with breaking-change notes from the changelog and required compatibility edits already applied.
- Engineers engage only with the cases that need judgment (breaking API surfaces, deprecated patterns in the codebase).

**Success criteria:** CI passes; no behavior regressions detected by the existing test suite.

**Scheduling hint:** wire to a cron trigger or a dedicated Linear project. Treat it like a standing meeting — it runs whether or not it's in the sprint.

---

### 3. Feature Flag Retirement

**Use case:** flags that have been fully ramped and should have their disabled path removed.

**Pattern:**
- On the day a flag ships at 100%, schedule a one-time session 30 days later.
- The session traces every usage of the flag in the codebase.
- Keeps the enabled path; deletes the disabled path and its tests.
- Opens a PR with a summary of what was removed and why.

**Success criteria:** no references to the flag remain; tests for the deleted path are removed; the enabled-path tests still pass.

**Guard:** if the flag controls infrastructure behavior (not UI), require explicit human approval before the session runs.

---

### 4. Test Coverage Fill

**Use case:** a module or subsystem below a coverage threshold.

**Pattern:**
1. Find the lowest-coverage modules (use `coverage_analyzer.py` from the bundled scripts).
2. Dispatch one parallel session per module, each writing tests until the module crosses the target threshold (e.g., 80% line coverage).
3. Review the generated tests for correctness before merging.

**Success criteria:** coverage threshold met; no tests rely on mocked internals that don't reflect real behavior.

**Caution:** generated tests can pass coverage metrics while testing the wrong thing. Require a human review pass for any test covering auth, payments, or data integrity.

---

### 5. Production Error Triage

**Use case:** long-tail Sentry errors that never clear the bar for a sprint ticket.

**Pattern:**
- Daily scheduled session with a Sentry/error-tracker integration.
- Pulls the top N unresolved errors (by volume or recency).
- For each: fetches stack traces and breadcrumbs, locates the relevant files, identifies the root cause, opens a targeted fix PR with a regression test.
- Errors that get a fix PR are labeled and tracked; engineers review and merge.

**Success criteria:** fix PR includes a regression test that would have caught the error; the fix is targeted (no blast-radius changes).

**Escalation:** if the root cause requires a schema migration or API change, the session reports `NEEDS_CONTEXT` and describes the blocker rather than attempting the fix.

---

### 6. Design System Drift

**Use case:** hardcoded values, one-off components, and spacing tokens that diverge from the shared design system.

**Pattern:**
- Daily scheduled session that scans merged PRs.
- Flags: hardcoded hex values, absolute pixel values for spacing, one-off components that duplicate a shared library component.
- Opens auto-fix PRs for each finding, replacing hardcoded values with design tokens and one-off components with the canonical equivalent.

**Success criteria:** no hardcoded design values remain in the scanned diff; replacements use the correct token from the design system.

**Scope guard:** do not touch files outside the scanned PR diff. Do not introduce new design tokens — only use existing ones.

---

### 7. Monolith Splits

**Use case:** a large file or module that has grown beyond a manageable size (e.g., a 2000-line Express router, a God class, a 500-line React component).

**Pattern:**
1. User initiates with a prompt describing the target structure and acceptable surface area.
2. Session breaks the file into per-domain modules; extracts shared concerns into service files; verifies that original URL paths, exports, and interfaces stay identical.
3. Existing test suite verifies the refactor.
4. Result is one PR representing the complete split.

**Success criteria:** all existing tests pass; no external interface changes; the original entry point re-exports cleanly.

**Commit discipline:** this work produces multiple commits (one per extracted module), not a single mega-commit, so reviewers can trace the extraction logic.

---

### 8. Docs Sync

**Use case:** documentation that drifts from the code it describes after merges.

**Pattern:**
- Daily scheduled session that diffs yesterday's merged PRs against the docs repo or inline docs.
- Opens corrective PRs for: renamed endpoints, deprecated options, behavioral changes, removed features.
- Does not invent new documentation — only updates what the diff shows changed.

**Success criteria:** every renamed endpoint or changed behavior in the code diff has a corresponding docs update in the PR.

**Scope:** only the docs that describe the changed code. Do not rewrite documentation outside the blast radius of the day's merges.

---

### 9. Bug Reproduction

**Use case:** issue reports that need reproduction before a fix can be written.

**Pattern:**
- Applying a label to a Linear/Jira/GitHub issue triggers an agent session.
- Session attempts to reproduce the issue in a browser or test environment.
- Attaches a screen recording or test that demonstrates the failure.
- Posts the steps-to-reproduce and a minimal reproduction case back on the ticket.
- Does not attempt a fix — reproduction only.

**Success criteria:** a failing test or recorded reproduction that a human engineer can use as the starting point for a fix.

**Escalation:** if the issue requires production data or environment access the agent cannot get, the session posts what it found and marks the reproduction as partial.

---

### 10. Lint-Enforced Anti-Pattern Elimination

**Use case:** A known bad pattern exists across many files — direct `useEffect`, raw SQL in controllers, hardcoded design tokens, untyped `any`, ad-hoc error swallowing — and needs systematic elimination without manual triage per file.

**Pattern:**
1. Define the violation as a lint rule (`no-restricted-syntax`, a custom ESLint plugin, or a grep-based CI check). The rule must be binary — either a line violates it or it doesn't.
2. Wire the rule to CI to block new violations from landing immediately.
3. Generate the full violation surface: run the linter and produce a list of files and line numbers.
4. Write a one-page playbook that maps violation type → correct replacement (e.g., `useEffect(() => setX(y), [y])` → inline derived state). The playbook must cover all common shapes of the violation — agents will follow it mechanically.
5. Dispatch one parallel agent session per file (or per module for large files), each applying the playbook to all violations in its assigned scope.
6. Review PRs for playbook compliance. Require a human pass for violations in high-risk areas (auth, payments, data integrity, migrations).
7. Once all PRs land, the lint gate blocks regressions automatically.

**Success criteria:** Zero lint violations remain; CI gate prevents all future occurrences; no behavioral regressions (existing test suite passes).

**Caution:** The playbook for the fix must be unambiguous before dispatch. If fixing a violation requires judgment (e.g., "should this be a query library fetch or an event handler?"), add a decision table to the playbook first. Ambiguous playbooks produce inconsistent PRs that cost more to review than they save. Start with the mechanically obvious violations and leave judgment-heavy ones for human review.

**Worked examples:**
- Direct `useEffect` → five replacement patterns in `performance/references/no-use-effect.md`
- Hardcoded hex values → replace with design system tokens
- `console.log` in production code → remove or replace with the project logger
- `Object.assign` for immutable updates → replace with spread syntax or Immer

---

## Prevention: PR-Level Quality Agents

The patterns above clear existing debt and prevent new debt from forming in parallel. Add agent-run PR review as an upstream gate:

- Run the bundled review agents (correctness-reviewer, adversarial-reviewer, performance-oracle) on every PR in CI.
- Flag standards violations, missing tests, and design-system drift at merge time, not during a quarterly cleanup pass.
- Treat the review agents as the first line of debt prevention; the cadences above as the cleanup crew for what slips through.

Once these cadences are in place, debt maintenance runs as a standing process rather than periodic crisis management.

## Starting Point

Most teams start with:
1. **Weekly dependency updates** — low risk, fast CI signal, immediate value.
2. **Daily Sentry triage** — turns invisible long-tail errors into tracked, fixable items.
3. **Lint-enforced anti-pattern elimination** — wire the lint gate first to block new violations, then dispatch parallel sessions to clear all existing ones. Start with the highest-frequency banned pattern in your codebase: direct `useEffect`, raw SQL in views, untyped `any`, or `console.log` in production code. Binary success criteria and parallelizable across files — ideal for a first cloud-agent batch run. See Pattern 10 for the full playbook and [performance/references/no-use-effect.md](https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/performance/references/no-use-effect.md) for the useEffect-specific enforcement guide.

All three build trust in the cloud-agent pattern before tackling larger migrations or monolith splits.
