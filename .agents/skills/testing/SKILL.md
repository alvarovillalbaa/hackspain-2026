---
name: testing
description: Route and execute test strategy, coverage, backend, frontend E2E, flake, and explicitly authorized business-logic or race-condition testing.
---

# Testing

Own the test strategy for a change, then route only the specialist lanes that need deeper execution.

## Use When

- Designing a test plan, regression strategy, suite architecture, TDD workflow, or coverage improvement.
- Testing backend services, APIs, persistence, queues, jobs, fixtures, and integration seams.
- Validating business-logic abuse or race conditions with explicit authorization and a safe target.
- Routing browser E2E or flaky-test work to the appropriate child skill.

## Children

- [`frontend-e2e`](../frontend-e2e/SKILL.md) - Browser-level user journeys, UI regressions, and end-to-end verification.
- [`flake`](../flake/SKILL.md) - Intermittent test diagnosis, reproduction, and stabilization.

## Route

| Request | Use |
| --- | --- |
| Test strategy, planning, TDD, suite architecture, regression coverage, or coverage analysis | Handle directly with this skill |
| Backend, API contract, service integration, fixture, queue, job, or persistence tests | Handle directly with this skill |
| Explicitly authorized business-logic abuse, race conditions, workflow bypasses, or economic-risk tests | Handle directly with this skill after confirming scope and target safety |
| Browser journeys and frontend E2E validation | [`frontend-e2e`](../frontend-e2e/SKILL.md) |
| Flaky or intermittent tests | [`flake`](../flake/SKILL.md) |
| LLM, agent, or RAG evaluation datasets, graders, calibration, experiments, or release gates | [`ai-evals`](../ai-evals/SKILL.md) through `quality-assurance` |

## Workflow

1. Read repository test commands, CI configuration, and the code under test before proposing coverage.
2. Define observable behavior, risk, boundaries, and the narrowest useful test layer, then place the test in its canonical folder and declare its data tier before writing it.
3. For race or abuse testing, require written authorization, prefer staging, bound concurrency, and avoid destructive production actions. Tests belonging in `tests/adversarial/` also satisfy the gate in [`../quality-assurance/references/test-suite-layout.md`](../quality-assurance/references/test-suite-layout.md).
4. Reproduce the current failure or establish a baseline before changing tests or implementation.
5. Add focused tests first; expand to integration or E2E only when the seam requires it.
6. Run the smallest relevant command, then the repository's broader verification gate when risk warrants it.
7. Report tested behavior, uncovered risk, environment constraints, and any remaining non-evaluated areas explicitly.

## References

Load only the material needed for the selected lane:

- Canonical test-suite contract, owned by the parent and binding on every lane: [`../quality-assurance/references/test-suite-layout.md`](../quality-assurance/references/test-suite-layout.md) for folder placement and the folder-by-tier matrix, [`../quality-assurance/references/test-data-tiers.md`](../quality-assurance/references/test-data-tiers.md) for tier definitions and the Tier 5 gate, [`../quality-assurance/references/test-frameworks.md`](../quality-assurance/references/test-frameworks.md) for framework selection, and [`../quality-assurance/references/test-evals-wrapping.md`](../quality-assurance/references/test-evals-wrapping.md) for the `tests/evals/` contract.
- Strategy and coverage: `references/test-strategy.md`, `references/test-planning.md`, `references/analyze-tests-methodology.md`, `references/suite-architecture.md`, `references/tdd-iron-laws.md`, and `references/verification.md`.
- Backend and integration: `references/backend-testing.md`, `references/python-backend-tests.md`, `references/django-drf-testing.md`, `references/integration-testing.md`, and `references/code-tests-cookbook.md`.
- Business logic and races: `references/business-logic-workflows.md`, `references/business-logic-tooling.md`, `references/race-condition-workflows.md`, and `references/race-condition-tools.md`.
- Framework-specific guidance: `references/pytest.md` and `references/vitest/`.

Use the scripts in `scripts/` for coverage analysis, suite generation, QA scans, test-database checks, and server-backed verification. Reuse `templates/` and `examples/` when producing plans or reports.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `pentest`
- `ai-engineering/ai-evals-observability`
- `frontend`
- `backend`
- `prs`
- `cloud`

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local rules, repository facts, safety gates, and explicit exceptions win when they conflict.

- `deslop`: Remove low-quality generated code without changing behavior. Install: `python3 scripts/install-external-skills.py --skill deslop --agent codex`.
- `thermo-nuclear-code-quality-review`: Run a strict maintainability and abstraction-quality review. Install: `python3 scripts/install-external-skills.py --skill thermo-nuclear-code-quality-review --agent codex`.
- `no-mistakes`: Gate explicit ship, push, PR, or validate flows through its verification pipeline. Install: `python3 scripts/install-external-skills.py --skill no-mistakes --agent codex`.
- `improve`: Run a read-only senior codebase audit and produce execution-ready plans. Install: `python3 scripts/install-external-skills.py --skill improve --agent codex`.
- `codebase-design`: Apply deep-module vocabulary to interface, seam, locality, and testability decisions. Install: `python3 scripts/install-external-skills.py --skill codebase-design --agent codex`.
- `improve-codebase-architecture`: Identify architectural deepening opportunities. Install: `python3 scripts/install-external-skills.py --skill improve-codebase-architecture --agent codex`.
- `grill-with-docs`: Stress-test a plan while maintaining supporting documentation. Install: `python3 scripts/install-external-skills.py --skill grill-with-docs --agent codex`.
- `tdd`: Apply an external test-first workflow for public-interface behavior changes. Install: `python3 scripts/install-external-skills.py --skill tdd --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
