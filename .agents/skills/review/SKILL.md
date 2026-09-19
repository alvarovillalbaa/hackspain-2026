---
name: review
description: Router for code review, design review, grilling, and documentation drift review.
---

# Review Router

## Children

- [`code-review`](../code-review/SKILL.md) - Code Review work.
- [`design-review`](../design-review/SKILL.md) - Design Review work.
- [`grill`](../grill/SKILL.md) - Grill work.
- [`documentation-drift`](../documentation-drift/SKILL.md) - Documentation Drift work.

## Route

| Request | Use |
| --- | --- |
| code review requests | [`code-review`](../code-review/SKILL.md) |
| design review requests | [`design-review`](../design-review/SKILL.md) |
| grill requests | [`grill`](../grill/SKILL.md) |
| documentation drift requests | [`documentation-drift`](../documentation-drift/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `quality-assurance`
- `frontend`
- `product-development`
- `prs`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
