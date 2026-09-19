---
name: product-development
description: Router for product strategy, discovery, PRDs, experiments, and user stories.
---

# Product Development Router

## Children

- [`strategy`](../strategy/SKILL.md) - Strategy work.
- [`discovery`](../discovery/SKILL.md) - Discovery work.
- [`prds`](../prds/SKILL.md) - Prds work.
- [`experiments`](../experiments/SKILL.md) - Experiments work.
- [`user-stories`](../user-stories/SKILL.md) - User Stories work.

## Route

| Request | Use |
| --- | --- |
| strategy requests | [`strategy`](../strategy/SKILL.md) |
| discovery requests | [`discovery`](../discovery/SKILL.md) |
| prds requests | [`prds`](../prds/SKILL.md) |
| experiments requests | [`experiments`](../experiments/SKILL.md) |
| user stories requests | [`user-stories`](../user-stories/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `product-marketing`
- `frontend/onboarding-flows`
- `quality-assurance/testing`
- `quality-assurance`
- `code-documentation`
- `reporting`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.
- Treat specs as product contracts driven manually or from external systems. Keep them focused on user outcomes, scope, acceptance criteria, and success metrics.
- Include technical hints only when they prevent a known implementation mistake; send detailed architecture and test design to `agentic-development` and `quality-assurance`.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
