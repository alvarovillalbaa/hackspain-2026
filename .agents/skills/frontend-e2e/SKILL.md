---
name: frontend-e2e
description: Use for browser QA, Playwright/Cypress flows, user-visible state validation, trace capture, and frontend regressions. Child of `testing`.
---

# Frontend E2E Browser Qa

This child skill owns browser QA, Playwright/Cypress flows, user-visible state validation, trace capture, and frontend regressions. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about browser QA, Playwright/Cypress flows, user-visible state validation, trace capture, and frontend regressions.
- The parent router [`../testing/SKILL.md`](../testing/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `pentest`, `ai-engineering/ai-evals-observability`, `frontend`, `backend`, `prs`, `cloud` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `browserbase-ui-test`: Use Browserbase UI testing guidance for browser-level product verification. Install: `python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`.
- `browserbase-browser`: Use Browserbase browser automation guidance for live web interactions. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser --agent codex`.
- `browserbase-browser-trace`: Capture and inspect browser traces for UI behavior and failures. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser-trace --agent codex`.
- `browserbase-autobrowse`: Use Browserbase autobrowse workflows for exploratory browser automation. Install: `python3 scripts/install-external-skills.py --skill browserbase-autobrowse --agent codex`.
- `browserbase-safe-browser`: Use safe-browser guidance for bounded browser automation and verification. Install: `python3 scripts/install-external-skills.py --skill browserbase-safe-browser --agent codex`.
- `browserbase-browser-to-api`: Convert browser workflows into API-backed automation when appropriate. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser-to-api --agent codex`.
- `browserbase-cookie-sync`: Use Browserbase cookie sync guidance for authenticated browser sessions. Install: `python3 scripts/install-external-skills.py --skill browserbase-cookie-sync --agent codex`.
- `browserbase-browser-use-to-stagehand`: Translate browser-use automation patterns into Stagehand workflows. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser-use-to-stagehand --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
