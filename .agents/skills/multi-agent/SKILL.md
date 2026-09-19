---
name: multi-agent
description: Route and coordinate multi-agent work across expert councils, adaptive loops, dependency graphs, and persistent goals. Use when several agents or workstreams must collaborate.
---

# Multi-Agent Router and Coordinator

Select one primary orchestration protocol. Chain protocols only when their state and ownership boundaries remain explicit.

## Children

- [`council`](../council/SKILL.md) - Situation-specific expert deliberation with one controller ruling.
- [`agentic-loops`](../agentic-loops/SKILL.md) - Bounded adaptive execution of one concrete task.
- [`agentic-graphs`](../agentic-graphs/SKILL.md) - Dependency-aware parallel execution and integration.
- [`agentic-goals`](../agentic-goals/SKILL.md) - Explicit durable outcome pursuit across turns.

## Route to the narrowest child

| Request shape | Use |
| --- | --- |
| Ask several situation-specific experts to analyze the same consequential question, critique, and reach one ruling | [`council`](../council/SKILL.md) |
| Repeatedly inspect, act, verify, and adapt on one concrete task until criteria or budget stop it | [`agentic-loops`](../agentic-loops/SKILL.md) |
| Coordinate dependent and parallel work nodes, handoffs, replanning, and integration | [`agentic-graphs`](../agentic-graphs/SKILL.md) |
| Persist and resume an explicitly requested outcome across turns | [`agentic-goals`](../agentic-goals/SKILL.md) |
| Delegate a small set of independent bounded subtasks and integrate once | Use this skill directly |

Route recurring improvement, evaluation, monitoring, memory, learning, or experimentation programs to System `loops`. Route skill-specific evaluation cycles to System `skill-eval-loop`. Do not use `agentic-loops` merely because a recurring program contains repetition.

## Choose an architecture

Decide the architecture per task; never default to one out of habit.

1. Consequential, ambiguous, or high-stakes judgment needing multiple expert lenses and formal recorded dissent → `council`.
2. One concrete task needing repeated inspect-act-verify-adapt cycles → `agentic-loops`.
3. Multiple dependent or parallel workstreams that need a dependency graph → `agentic-graphs`.
4. A durable outcome to pursue and resume across turns → `agentic-goals`.
5. None of the above fits, but the task still benefits from a named coordination shape (pipeline, hierarchical review, debate, manager-as-tools, handoff, fan-out+merge, map-reduce-refine, blackboard) → pick the matching recipe from [`references/architecture-catalog.md`](references/architecture-catalog.md) and run it through "Coordinate simple delegation" below.
6. Trivial, one or two local edits → do it inline; no architecture needed.

## Coordinate simple delegation

1. Define the shared outcome, constraints, evidence, authority boundary, integration owner, and final acceptance checks.
2. Split only independent, bounded subtasks with disjoint write scopes. Keep dependent work serial or route it to `agentic-graphs`.
3. Give each worker the minimum task-local context, explicit deliverable, allowed tools, write scope, and verification requirement. Do not leak the expected answer when independence matters.
4. Track owners and wait for every required handoff. Require evidence, artifact paths, verification, assumptions, and residual risks.
5. Let one controller reconcile conflicts and integrate. Workers must not edit the same files or shared external state concurrently.
6. Verify the assembled result against the original acceptance checks. Report incomplete or conflicting work instead of averaging it away.

## Preserve safety and evaluation integrity

- Keep destructive, externally visible, costly, security-sensitive, and shared-state actions approval-gated per worker and per action.
- Never treat delegation as expanded authority. Stop workers that broaden scope or discover overlapping writes.
- Use fresh workers and raw artifacts for independent validation. Do not reveal the intended result, suspected defect, or another worker's answer unless the protocol calls for a critique phase.
- Bound concurrency, turns, time, cost, and retries. Honor cancellation promptly.
- If subagents are unavailable, execute sequentially and disclose the limitation; do not claim parallel or independent sampling.

## Use bundled guidance

- Read [`references/subagents-and-parallelism.md`](references/subagents-and-parallelism.md) for isolation and capacity guidance.
- Read [`references/architecture-catalog.md`](references/architecture-catalog.md) for named coordination recipes (pipeline, hierarchical, debate, blackboard, map-reduce-refine, fan-out+merge, manager-as-tools, handoff) when none of the four protocol children fit.
- Read [`references/subagent-prompt-templates.md`](references/subagent-prompt-templates.md) before designing reusable worker contracts.
- Use the child skill's validators and artifact templates whenever a child owns the request.
- Use `scripts/agent_orchestrator.py` for on-demand orchestration scaffolding. This parent owns the implementation; architecture skills only describe system structure.

## Chain Rules

- `quality-assurance`
- `code-documentation`
- `agent-harness`

## External skill chains

Use live external skills only when installed. Preserve local safety, repo rules, and child contracts over external guidance.

- `codex-loop` and `claude-loop`: use only for their explicit PRD/story-runner workflows, not as substitutes for this router's child protocols.
- `ralph`: use for an installed Ralph-style execution workflow when the user specifically requests it.
- `clous-agent-runs`: use for operating and inspecting Clous-owned agent runs.

Consult [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml) for installation commands and [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the shared graph.
