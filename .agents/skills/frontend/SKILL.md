---
name: frontend
description: Router for frontend implementation, performance, accessibility, and onboarding flows.
---

# Frontend Router

## Children

- [`performance`](../performance/SKILL.md) - Performance work.
- [`accessibility`](../accessibility/SKILL.md) - Accessibility work.
- [`onboarding-flows`](../onboarding-flows/SKILL.md) - Onboarding Flows work.

## Route

| Request | Use |
| --- | --- |
| performance requests | [`performance`](../performance/SKILL.md) |
| accessibility requests | [`accessibility`](../accessibility/SKILL.md) |
| onboarding flows requests | [`onboarding-flows`](../onboarding-flows/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `product-development`
- `product-marketing`
- `testing/frontend-e2e`
- `quality-assurance`
- `code-documentation`
- `images`
- `visualization`
- `design`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.
- Do not hide bad backend or API payloads with frontend normalization or data-shape transformations. Fix the producer or contract owner and make invalid shapes fail visibly.
- Defer Fluid Functionalism interaction details to the `fluid-functionalism` reference source; keep this router focused on local frontend ownership and contracts.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `hallmark`: Audit, redesign, study, or build UI with anti-AI-slop design constraints. Install: `python3 scripts/install-external-skills.py --skill hallmark --agent codex`.
- `taste-skill`: Use taste guidance for visual direction, hierarchy, and UI polish decisions. Install: `python3 scripts/install-external-skills.py --skill taste-skill --agent codex`.
- `impeccable`: Use impeccable UI quality guidance for execution-level frontend finish. Install: `python3 scripts/install-external-skills.py --skill impeccable --agent codex`.
- `emil-design-eng`: Use design-engineering taste rules for high-quality frontend implementation. Install: `python3 scripts/install-external-skills.py --skill emil-design-eng --agent codex`.
- `userinterface-wiki`: Use interface-pattern references for layout, components, states, and product UI decisions. Install: `python3 scripts/install-external-skills.py --skill userinterface-wiki --agent codex`.
- `transitions-dev`: Use transition patterns for purposeful UI and page motion. Install: `python3 scripts/install-external-skills.py --skill transitions-dev --agent codex`.
- `animate-text`: Use text animation patterns for motion-heavy content and video scenes. Install: `python3 scripts/install-external-skills.py --skill animate-text --agent codex`.
- `browserbase-browser`: Use Browserbase browser automation guidance for live web interactions. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser --agent codex`.
- `browserbase-safe-browser`: Use safe-browser guidance for bounded browser automation and verification. Install: `python3 scripts/install-external-skills.py --skill browserbase-safe-browser --agent codex`.
- `fluid-functionalism`: Reference-only: Use the source-owned interaction-style guidance for motion and hover decisions. No installer target.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.

## References

- `references/ux-ui-design-principles.md` — comprehensive UX/UI reference: visual design, interaction, accessibility (WCAG/APCA), layout, forms, performance, copy, states, URL/state patterns
- `references/frontend-design.md` — distinctive frontend design guide: aesthetic direction, typography, color, motion, spatial composition, anti-patterns ("AI slop")
- `references/frontend-implementation-source/` — former frontend-implementation assets

## Merged Sources

This router also preserves the former frontend-implementation assets under `references/frontend-implementation-source/`.
