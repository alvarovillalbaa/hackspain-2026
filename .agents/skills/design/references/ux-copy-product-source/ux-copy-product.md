---
name: ux-copy-product
description: >-
  Use for in-product UX copy for CTAs, errors, empty states, confirmations,
  loading states, onboarding, and recovery paths. Child skill of `product-
  development`; route here from the parent router when this lane is the
  narrowest owner.
---

# UX Copy Product

This child skill owns in-product UX copy for CTAs, errors, empty states, confirmations, loading states, onboarding, and recovery paths. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about in-product UX copy for CTAs, errors, empty states, confirmations, loading states, onboarding, and recovery paths.
- The parent router [`../../../product-development/SKILL.md`](../../../product-development/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `product-marketing`, `frontend/onboarding-flows`, `quality-assurance/testing`, `reporting` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `unslop`: Remove AI tells from prose while preserving meaning and voice. Install: `python3 scripts/install-external-skills.py --skill unslop --agent codex`.
- `stop-slop`: Apply stricter prose cleanup for predictable AI writing patterns. Install: `python3 scripts/install-external-skills.py --skill stop-slop --agent codex`.

Registry: [`../../../../../references/external-skills.yaml`](../../../../../references/external-skills.yaml).

## Shared Map

See [`../../../../../skills-chaining-map.md`](../../../../../skills-chaining-map.md) for the complete skills-chaining graph.
