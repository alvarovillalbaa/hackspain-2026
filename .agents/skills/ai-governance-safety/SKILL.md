---
name: ai-governance-safety
description: Use for agent governance, safety gates, scope isolation, autonomy limits, prompt-injection posture, and side-effect controls. Child of `ai-engineering`.
---

# AI Governance Safety

This child skill owns agent governance, safety gates, scope isolation, autonomy limits, prompt-injection posture, and side-effect controls. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about agent governance, safety gates, scope isolation, autonomy limits, prompt-injection posture, and side-effect controls.
- The parent router [`../ai-engineering/SKILL.md`](../ai-engineering/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `quality-assurance/ai-evals`, `quality-assurance/security`, `backend`, `cloud`, `plugins-management`, `brain` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
