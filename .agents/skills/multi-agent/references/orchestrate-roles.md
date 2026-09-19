# Orchestrate Roles

Use this reference when distributing a large task across runtime-provided agents via `/orchestrate`. The pattern prevents context bleed, cross-talk, and scope drift that occur when one long-running agent handles too much work.

## Core Model

Five distinct node types. Each has exactly one responsibility. Mixing them is the primary failure mode.

| Role | Responsibility | Does NOT do |
|------|---------------|------------|
| **Dispatcher** | Kicks off the planner; receives the final handoff. One-shot. | Code, plan, or review |
| **Planner** | Owns a scope; writes `plan.json`; publishes tasks; reads handoffs; loops until scope is done. | Write code directly |
| **Subplanner** | Recursively owns a sub-scope delegated by the planner. Aggregates results before handing back. | Skip aggregation |
| **Worker** | Executes one isolated task; returns one structured handoff. | Talk to sibling workers |
| **Verifier** | Validates acceptance criteria for a task slice. | Rewrite the task definition |

## Key Principles

**Planners own scope, workers own execution.**
A planner's job is to decompose work and track progress, not to implement. If a planner starts writing code, the plan will drift.

**No cross-talk.**
Workers operate independently in separate workspaces when the runtime supports them. Information flows vertically through structured handoffs — upward to the planner — never horizontally between siblings. Siblings that share state introduce race conditions and context bleed. When isolation is unavailable, run write tasks sequentially and disclose the limitation.

**Handoffs are the contract.**
A worker's output is a single structured handoff artifact (a file or JSON blob committed to the branch). The planner reads it, not the worker's conversation.

**plan.json is authoritative state.**
The planner writes `plan.json` as the living state of the work. If the planner is restarted, it re-reads `plan.json` to reconstruct context rather than relying on conversational memory. This prevents drift across long-running sessions.

**Continuous propagation.**
The planner has no "finished" state until it decides all tasks are done. It keeps publishing new tasks from handoffs. Stopping happens by the dispatcher calling `kill` or by the planner detecting an empty queue.

## State File: plan.json

```json
{
  "goal": "string — the original goal",
  "tasks": [
    {
      "id": "string",
      "scope": "string — what the worker owns",
      "status": "pending | running | done | failed",
      "handoff": "path/to/handoff.json or null",
      "worker_handle": "runtime-specific handle or null"
    }
  ],
  "completed_at": null
}
```

Update `status` and `handoff` atomically. Never leave `status: running` without a resolvable `worker_handle`.

## Andon Pull Cord

Any worker or verifier can signal the planner to pause the pipeline by writing `andon: true` in their handoff. The planner reads this flag before publishing the next task and escalates to the dispatcher (human) instead of continuing. Use Andon when:

- A worker discovers the scope is wider than estimated (would affect > 3 other tasks)
- A verifier finds a fundamental spec ambiguity that blocks acceptance
- A worker encounters a security or destructive-operation boundary

The dispatcher resolves the issue and resumes the planner by clearing the `andon` flag and using the runtime's resume or follow-up mechanism.

## Dispatcher Entry Point

The dispatcher is the controlling session. It never transitions to planner or worker mode.

1. Discover the current runtime's agent, delegation, cancellation, follow-up, and status capabilities.
2. If the repository ships an orchestration CLI, use it only after reading its local contract and verifying that it preserves the authority and isolation rules in this reference.
3. If no parallel-agent capability exists, execute the same graph sequentially and report that independent parallel verification was unavailable.
4. Keep runtime-specific handles in `worker_handle`; do not bake provider URLs, tokens, or account identifiers into the reusable plan.

## When to Use /orchestrate

Use when:
- The task spans multiple independent sub-scopes that can be isolated without shared mutable writes
- A single agent would exceed its context budget partway through
- The work is too large for a single `/dev-loop` iteration ceiling
- Human supervision is desirable at the planner level, not at every worker step

Do NOT use when:
- Sub-tasks share mutable state that workers would need to read mid-flight
- The scope is unclear (orchestrating an ambiguous goal produces orphaned workers)
- The repo has no reliable verify command (workers cannot self-check their handoffs)
- You want fast iteration — the spawn/handoff cycle adds latency vs. direct execution

## Connection to Harness Loops

`/orchestrate` is for cloud-parallel execution of large scopes. `/dev-loop` and `/harness-loop` are for in-session iteration on a single agent. They are complementary:

- Use `/orchestrate` to break the epic into independently verifiable sub-scopes
- Use `/dev-loop` inside each worker session to iterate on that sub-scope
- Use `/harness-loop` after an orchestrated pass to enforce any new conventions discovered
