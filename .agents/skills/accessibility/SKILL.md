---
name: accessibility
description: Audit and implement frontend accessibility, semantic structure, keyboard behavior, screen-reader support, and WCAG-oriented fixes.
---

# Accessibility

Use this skill for the named lane in the current taxonomy. Route to sibling skills when the request crosses ownership boundaries, and preserve local rules over external guidance when they conflict.

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `userinterface-wiki`: Use interface-pattern references for layout, components, states, and product UI decisions. Install: `python3 scripts/install-external-skills.py --skill userinterface-wiki --agent codex`.
- `browserbase-ui-test`: Use Browserbase UI testing guidance for browser-level product verification. Install: `python3 scripts/install-external-skills.py --skill browserbase-ui-test --agent codex`.
- `hallmark`: Audit, redesign, study, or build UI with anti-AI-slop design constraints. Install: `python3 scripts/install-external-skills.py --skill hallmark --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).
