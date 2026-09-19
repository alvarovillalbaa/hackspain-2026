---
name: prds
description: Use for PRDs, feature briefs, requirements, scope boundaries, release criteria, and cross-functional product specs. Child of `product-development`.
---

# Prds

This child skill owns PRDs, feature briefs, requirements, scope boundaries, release criteria, and cross-functional product specs. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about PRDs, feature briefs, requirements, scope boundaries, release criteria, and cross-functional product specs.
- The parent router [`../product-development/SKILL.md`](../product-development/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `product-marketing`, `frontend/onboarding-flows`, `quality-assurance/testing`, `quality-assurance`, `code-documentation`, `reporting` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.
- Keep PRDs product-focused and manually or externally driven: problem, users, scope, acceptance, rollout intent, and success criteria.
- Do not turn PRDs into technical design docs. Include only small technical constraints, hints, or known owner seams that prevent obvious execution mistakes.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `codex-loop`: Run Codex PRD/story loops with one fresh subagent per story. Install: `python3 scripts/install-external-skills.py --skill codex-loop --agent codex`.
- `claude-loop`: Run Claude PRD/story loops with one fresh subagent per story. Install: `python3 scripts/install-external-skills.py --skill claude-loop --agent codex`.
- `ralph-prd`: Use Ralph PRD guidance for product-spec structure before execution loops. Install: `python3 scripts/install-external-skills.py --skill ralph-prd --agent codex`.
- `ralph-playbook`: Reference-only: Use as Ralph playbook context for PRD-to-execution loops. No installer target.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
