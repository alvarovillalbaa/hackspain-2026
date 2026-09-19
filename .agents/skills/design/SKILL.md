---
name: design
description: Router for product design taste, direction, systems, polish, and critique.
---

# Design Router

## Children

- [`taste`](../taste/SKILL.md) - Taste work.
- [`direction`](../direction/SKILL.md) - Direction work.
- [`design-systems`](../design-systems/SKILL.md) - Design Systems work.
- [`polish`](../polish/SKILL.md) - Polish work.
- [`critique`](../critique/SKILL.md) - Critique work.

## Route

| Request | Use |
| --- | --- |
| taste requests | [`taste`](../taste/SKILL.md) |
| direction requests | [`direction`](../direction/SKILL.md) |
| design systems requests | [`design-systems`](../design-systems/SKILL.md) |
| polish requests | [`polish`](../polish/SKILL.md) |
| critique requests | [`critique`](../critique/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `frontend`
- `product-development`
- `product-marketing`
- `testing/frontend-e2e`
- `code-documentation`
- `visualization`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.
- Defer Fluid Functionalism style details to the `fluid-functionalism` reference source; keep this skill focused on local product-design constraints.
- Document reusable design decisions and verify critical UI changes through the appropriate QA lane.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `hallmark`: Audit, redesign, study, or build UI with anti-AI-slop design constraints. Install: `python3 scripts/install-external-skills.py --skill hallmark --agent codex`.
- `taste-skill`: Use taste guidance for visual direction, hierarchy, and UI polish decisions. Install: `python3 scripts/install-external-skills.py --skill taste-skill --agent codex`.
- `taste-skill-v1`: Use legacy taste guidance when the newer taste skill does not fit the brief. Install: `python3 scripts/install-external-skills.py --skill taste-skill-v1 --agent codex`.
- `gpt-tasteskill`: Use taste critique guidance for stronger visual judgment and UI decisions. Install: `python3 scripts/install-external-skills.py --skill gpt-tasteskill --agent codex`.
- `impeccable`: Use impeccable UI quality guidance for execution-level frontend finish. Install: `python3 scripts/install-external-skills.py --skill impeccable --agent codex`.
- `emil-design-eng`: Use design-engineering taste rules for high-quality frontend implementation. Install: `python3 scripts/install-external-skills.py --skill emil-design-eng --agent codex`.
- `userinterface-wiki`: Use interface-pattern references for layout, components, states, and product UI decisions. Install: `python3 scripts/install-external-skills.py --skill userinterface-wiki --agent codex`.
- `fluid-functionalism`: Reference-only: Use the source-owned interaction-style guidance for motion and hover decisions. No installer target.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.

## Merged Sources

This router preserves the former ux-copy-product assets under `references/ux-copy-product-source/` while design-specific child skills own visual and UX review lanes.
