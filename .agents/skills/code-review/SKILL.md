---
name: code-review
description: Use for code review, diff risk assessment, PR findings, regression risk, test gaps, and maintainability critique. Child of `review`.
---

# Code Diff Review

This child skill owns code review, diff risk assessment, PR findings, regression risk, test gaps, and maintainability critique. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about code review, diff risk assessment, PR findings, regression risk, test gaps, and maintainability critique.
- The parent router [`../review/SKILL.md`](../review/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `quality-assurance`, `frontend`, `product-development`, `prs` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `deslop`: Remove AI-generated code slop from the current diff without changing behavior. Install: `python3 scripts/install-external-skills.py --skill deslop --agent codex`.
- `thermo-nuclear-code-quality-review`: Run an unusually strict maintainability and abstraction-quality review. Install: `python3 scripts/install-external-skills.py --skill thermo-nuclear-code-quality-review --agent codex`.
- `no-mistakes`: Gate explicit ship, push, PR, or validate flows through the no-mistakes pipeline. Install: `python3 scripts/install-external-skills.py --skill no-mistakes --agent codex`.
- `improve`: Run a read-only senior codebase audit and write execution-ready plans for other agents. Install: `python3 scripts/install-external-skills.py --skill improve --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
