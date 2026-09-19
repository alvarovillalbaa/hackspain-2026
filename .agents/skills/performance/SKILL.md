---
name: performance
description: Use for frontend performance, accessibility, responsiveness, rendering stability, bundle behavior, and Core Web Vitals. Child of `frontend`.
---

# Frontend Performance Accessibility

This child skill owns frontend performance, accessibility, responsiveness, rendering stability, bundle behavior, and Core Web Vitals. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about frontend performance, accessibility, responsiveness, rendering stability, bundle behavior, and Core Web Vitals.
- The parent router [`../frontend/SKILL.md`](../frontend/SKILL.md) selects this child.
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

- `userinterface-wiki`: Use interface-pattern references for layout, components, states, and product UI decisions. Install: `python3 scripts/install-external-skills.py --skill userinterface-wiki --agent codex`.
- `review-animations`: Review animation timing, easing, and intent against expert motion guidance. Install: `python3 scripts/install-external-skills.py --skill review-animations --agent codex`.
- `transitions-dev`: Use transition patterns for purposeful UI and page motion. Install: `python3 scripts/install-external-skills.py --skill transitions-dev --agent codex`.
- `browserbase-browser-trace`: Capture and inspect browser traces for UI behavior and failures. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser-trace --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.

## Merged Sources

This skill now owns both frontend performance/accessibility source material and the former performance-testing skill. See `references/performance-testing-source/` for the migrated performance-testing assets.
