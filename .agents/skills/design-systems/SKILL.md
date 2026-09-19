---
name: design-systems
description: Use for design systems, shared primitives, tokens, component APIs, reusable UI patterns, and design-system drift. Child of `design`.
---

# Design Systems Components

This child skill owns design systems, shared primitives, tokens, component APIs, reusable UI patterns, and design-system drift. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about design systems, shared primitives, tokens, component APIs, reusable UI patterns, and design-system drift.
- The parent router [`../design/SKILL.md`](../design/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `product-development`, `product-marketing`, `testing/frontend-e2e`, `quality-assurance`, `code-documentation`, `images`, `visualization` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.
- Defer Fluid Functionalism interaction details to the `fluid-functionalism` reference source; keep this skill focused on local component contracts.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `hallmark`: Audit, redesign, study, or build UI with anti-AI-slop design constraints. Install: `python3 scripts/install-external-skills.py --skill hallmark --agent codex`.
- `brandkit`: Use brand kit guidance for brand-system extraction and application. Install: `python3 scripts/install-external-skills.py --skill brandkit --agent codex`.
- `userinterface-wiki`: Use interface-pattern references for layout, components, states, and product UI decisions. Install: `python3 scripts/install-external-skills.py --skill userinterface-wiki --agent codex`.
- `impeccable`: Use impeccable UI quality guidance for execution-level frontend finish. Install: `python3 scripts/install-external-skills.py --skill impeccable --agent codex`.
- `emil-design-eng`: Use design-engineering taste rules for high-quality frontend implementation. Install: `python3 scripts/install-external-skills.py --skill emil-design-eng --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
