---
name: design-review
description: Use for design review, UX critique, visual hierarchy, interaction risk, accessibility observations, and polish recommendations. Child of `review`.
---

# Design UX Review

This child skill owns design review, UX critique, visual hierarchy, interaction risk, accessibility observations, and polish recommendations. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about design review, UX critique, visual hierarchy, interaction risk, accessibility observations, and polish recommendations.
- The parent router [`../review/SKILL.md`](../review/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `quality-assurance`, `frontend`, `product-development`, `prs` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
