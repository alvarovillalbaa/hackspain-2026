---
name: agentic-development
description: Router for agentic software development, system design, execution loops, release landing, harness improvement, and technical debt work.
---

# Agentic Development Router

## Children

- [`architecture`](../architecture/SKILL.md) - Architecture work.
- [`multi-agent`](../multi-agent/SKILL.md) - Multi Agent work.
- [`release-landing`](../release-landing/SKILL.md) - Release Landing work.
- [`agent-harness`](../agent-harness/SKILL.md) - Agent Harness work.
- [`tech-debt`](../tech-debt/SKILL.md) - Tech Debt work.

## Route

| Request | Use |
| --- | --- |
| architecture requests | [`architecture`](../architecture/SKILL.md) |
| multi-agent / subagent requests — architecture (council, pipeline, hierarchical, debate, blackboard, fan-out, …) is chosen per task, not fixed | [`multi-agent`](../multi-agent/SKILL.md) |
| release landing requests | [`release-landing`](../release-landing/SKILL.md) |
| agent harness requests | [`agent-harness`](../agent-harness/SKILL.md) |
| tech debt requests | [`tech-debt`](../tech-debt/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `frontend`
- `backend`
- `quality-assurance`
- `code-documentation`
- `cloud`
- `prs`
- `plugins-management`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.
- For non-trivial implementation, contract, architecture, or release work, route proof through `quality-assurance` and update nearby durable docs through `code-documentation`.
- Prefer hard cuts: do not plan backfills, compatibility shims, backward-compat aliases, facade layers, or routing-file bridges unless the user explicitly asks for a temporary production-migration path.
- Multi-agent work has no default architecture: route to `multi-agent`, which picks council, a loop, a graph, a goal, or an ad-hoc coordination recipe per task rather than defaulting to one out of habit.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `codex-loop`: Run Codex PRD/story loops with one fresh subagent per story. Install: `python3 scripts/install-external-skills.py --skill codex-loop --agent codex`.
- `claude-loop`: Run Claude PRD/story loops with one fresh subagent per story. Install: `python3 scripts/install-external-skills.py --skill claude-loop --agent codex`.
- `ralph`: Use Ralph-style autonomous execution loops for scoped implementation plans. Install: `python3 scripts/install-external-skills.py --skill ralph --agent codex`.
- `no-mistakes`: Gate explicit ship, push, PR, or validate flows through the no-mistakes pipeline. Install: `python3 scripts/install-external-skills.py --skill no-mistakes --agent codex`.
- `how-to-ralph-wiggum`: Reference-only: Use as Ralph-style methodology context for autonomous agent execution. No installer target.
- `ralph-playbook`: Reference-only: Use as Ralph playbook context for PRD-to-execution loops. No installer target.
- `clous-agent-runs`: Use Clous-owned agent run guidance for operating and inspecting agent executions. Install: `python3 scripts/install-external-skills.py --skill clous-agent-runs --agent codex`.
- `clous-platform-operation`: Use Clous-owned platform operation guidance for runtime and workspace operations. Install: `python3 scripts/install-external-skills.py --skill clous-platform-operation --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
