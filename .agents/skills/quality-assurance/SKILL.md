---
name: quality-assurance
description: Route testing, behavior-preserving simplification, security validation, and authoritative AI evaluation work to the narrowest Engineering child, and own the canonical test-suite contract - the tests folder layout, the five test-data tiers including read-only production access, and the framework-per-test-type mapping.
---

# Quality Assurance Router

## Use When

- Choosing which QA lane owns a request: testing, simplification, security, or AI evals.
- Deciding where a test belongs in the `tests/` tree, what data it may touch, or which framework it should use. This skill owns that contract for every child.
- Authorizing or refusing production-database access for a test.
- Diagnosing a failing suite, a CI-only failure, or a performance regression before a lane is selected.

## Standards

These bind every child skill. Depth is in `## References`.

- Tests live under `tests/` in eight folders: `unit/`, `integration/`, `e2e/`, `smoke/`, `regression/`, `adversarial/`, `evals/` (AI products only), and `tmp/`. Support directories - `factories/`, `fixtures/`, `helpers/`, `scripts/`, `data/` - sit alongside them and are not test types. Sub-directories inside a canonical folder are encouraged; new top-level buckets are not.
- Every test that touches data declares one tier: T1 no data, T2 mock data, T3 local replica database, T4 staging replica with rollback, T5 production read-only.
- **Zero writes to production at any tier**, and no production service calls with side effects at any tier. T5 requires all four gate conditions: a database role with no write grants, a recorded authorization reference that fails closed, exclusion from the default suite and every PR gate, and read-only assertions only. If the role cannot be proven read-only, the tier is unavailable - fail the test rather than proceed.
- `tests/evals/` wraps an eval suite the eval system already defines. It never defines datasets, graders, or thresholds.
- `tests/adversarial/` abuses your own interfaces on a non-production target and asserts that a defensive control fires. Exploitation tooling and third-party targets route to `pentest`.
- `tests/tmp/` is gitignored, never runs in CI, and is promoted or deleted before the task is declared done.

## Children

- [`testing`](../testing/SKILL.md) - Test strategy, coverage, backend, frontend E2E, flake, and authorized race-testing work.
- [`simplify`](../simplify/SKILL.md) - Behavior-preserving reduction of unnecessary code and complexity.
- [`security`](../security/SKILL.md) - Security work.
- [`ai-evals`](../ai-evals/SKILL.md) - Provider-neutral AI eval design, datasets, graders, calibration, experiments, statistics, and official release gates.

## Route

| Request | Use |
| --- | --- |
| Test strategy, coverage, backend tests, frontend E2E, flakes, or explicitly authorized business-logic and race testing | [`testing`](../testing/SKILL.md) |
| Reduce duplication, indirection, branching, wrappers, or compatibility residue without changing behavior | [`simplify`](../simplify/SKILL.md) |
| Remove AI-generated code slop, vague naming, noisy comments, or weak generated patterns | External `deslop` skill |
| security requests | [`security`](../security/SKILL.md) |
| LLM/agent/RAG scenarios, eval datasets, graders, calibration, statistical comparison, prompt optimization, or release gates | [`ai-evals`](../ai-evals/SKILL.md) |
| Production AI traces, telemetry, drift dashboards, score monitoring, or operational debugging | [`ai-evals-observability`](../ai-evals-observability/SKILL.md) through `ai-engineering` |
| Where a test belongs, which data tier it may use, which framework fits, or whether production access is permitted | Handle directly with this skill - see `## References` |
| Wrapping an already-defined eval suite as a repository test | [`references/test-evals-wrapping.md`](references/test-evals-wrapping.md), then [`ai-evals`](../ai-evals/SKILL.md) if the suite itself must change |
| Diagnosing a failing test, CI-only failure, flaky symptom, or performance regression before a lane is chosen | [`references/debugging.md`](references/debugging.md), then [`testing`](../testing/SKILL.md) and its `flake` child for intermittency |

## References

Load only the material the request needs.

- Test-suite contract, owned here; `testing` and its children defer to these: [`references/test-suite-layout.md`](references/test-suite-layout.md) for the folder layout and the folder-by-tier matrix, [`references/test-data-tiers.md`](references/test-data-tiers.md) for tier definitions, provisioning, and the Tier 5 gate, [`references/test-frameworks.md`](references/test-frameworks.md) for framework selection, and [`references/test-evals-wrapping.md`](references/test-evals-wrapping.md) for the `tests/evals/` contract.
- Cross-cutting failure diagnosis shared by every lane: [`references/debugging.md`](references/debugging.md).

Use `scripts/audit_test_layout.py` to audit a repository's `tests/` tree against the contract, and [`templates/test-suite-scaffold.md`](templates/test-suite-scaffold.md) when establishing or migrating a suite.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `pentest`
- `ai-engineering/ai-evals-observability`
- `frontend/performance`
- `frontend`
- `backend`
- `prs`
- `cloud`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth. The one depth this parent owns is the shared test-suite contract, because it binds every child - do not push it down into `testing`.
- When a child's reference conflicts with the test-suite contract, the contract wins; fix the child rather than forking the rule.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `deslop`: Remove AI-generated code slop from the current diff without changing behavior. Install: `python3 scripts/install-external-skills.py --skill deslop --agent codex`.
- `thermo-nuclear-code-quality-review`: Run an unusually strict maintainability and abstraction-quality review. Install: `python3 scripts/install-external-skills.py --skill thermo-nuclear-code-quality-review --agent codex`.
- `no-mistakes`: Gate explicit ship, push, PR, or validate flows through the no-mistakes pipeline. Install: `python3 scripts/install-external-skills.py --skill no-mistakes --agent codex`.
- `improve`: Run a read-only senior codebase audit and write execution-ready plans for other agents. Install: `python3 scripts/install-external-skills.py --skill improve --agent codex`.
- `browserbase-ui-test`: Use Browserbase UI testing guidance for browser-level product verification. Install: `python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
