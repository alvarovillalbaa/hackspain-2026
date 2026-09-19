---
name: planning
description: Use for financial planning, CFO briefings, burn/runway, scenario models, budgets, forecasts, and board-ready finance narratives. Child of `finances`.
---

# Financial Planning

This child skill owns financial planning, CFO briefings, burn/runway, scenario models, budgets, forecasts, and board-ready finance narratives. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about financial planning, CFO briefings, burn/runway, scenario models, budgets, forecasts, and board-ready finance narratives.
- The parent router [`../finances/SKILL.md`](../finances/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `reporting`, `research`, `product-marketing` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
