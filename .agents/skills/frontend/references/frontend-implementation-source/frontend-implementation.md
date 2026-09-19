---
name: frontend-implementation
description: >-
  Use for ordinary React, Next, and browser implementation for components,
  routes, hooks, state, forms, styling, and framework integration. Child
  skill of `frontend`; route here from the parent router when this lane is
  the narrowest owner.
---

# Frontend Implementation

This child skill owns ordinary React, Next, and browser implementation for components, routes, hooks, state, forms, styling, and framework integration. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about ordinary React, Next, and browser implementation for components, routes, hooks, state, forms, styling, and framework integration.
- The parent router [`../../SKILL.md`](../../SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `product-development`, `product-marketing`, `testing/frontend-e2e`, `images`, `visualization` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `codebase-design`: Use deep-module vocabulary for interface, seam, depth, locality, and testability decisions. Install: `python3 scripts/install-external-skills.py --skill codebase-design --agent codex`.
- `improve-codebase-architecture`: Find deepening opportunities and produce visual architecture-review candidates. Install: `python3 scripts/install-external-skills.py --skill improve-codebase-architecture --agent codex`.
- `grill-with-docs`: Stress-test a plan or design while maintaining docs, ADRs, and glossary context. Install: `python3 scripts/install-external-skills.py --skill grill-with-docs --agent codex`.
- `tdd`: Use external test-first workflow for public-interface behavior changes. Install: `python3 scripts/install-external-skills.py --skill tdd --agent codex`.

Registry: [`../../../../../references/external-skills.yaml`](../../../../../references/external-skills.yaml).

## Shared Map

See [`../../../../../skills-chaining-map.md`](../../../../../skills-chaining-map.md) for the complete skills-chaining graph.
