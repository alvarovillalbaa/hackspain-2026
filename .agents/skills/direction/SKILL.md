---
name: direction
description: Use for visual direction, UI concept framing, design language choices, and option shaping before detailed component work. Child of `design`.
---

# Design Direction

This child skill owns visual direction, UI concept framing, design language choices, and option shaping before detailed component work. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about visual direction, UI concept framing, design language choices, and option shaping before detailed component work.
- The parent router [`../design/SKILL.md`](../design/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `product-development`, `product-marketing`, `testing/frontend-e2e`, `quality-assurance`, `code-documentation`, `images`, `visualization` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.
- Defer Fluid Functionalism direction details to the `fluid-functionalism` reference source when interaction style is part of the brief.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `hallmark`: Audit, redesign, study, or build UI with anti-AI-slop design constraints. Install: `python3 scripts/install-external-skills.py --skill hallmark --agent codex`.
- `brandkit`: Use brand kit guidance for brand-system extraction and application. Install: `python3 scripts/install-external-skills.py --skill brandkit --agent codex`.
- `taste-skill`: Use taste guidance for visual direction, hierarchy, and UI polish decisions. Install: `python3 scripts/install-external-skills.py --skill taste-skill --agent codex`.
- `impeccable`: Use impeccable UI quality guidance for execution-level frontend finish. Install: `python3 scripts/install-external-skills.py --skill impeccable --agent codex`.
- `fluid-functionalism`: Reference-only: Use the source-owned interaction-style guidance for motion and hover decisions. No installer target.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
