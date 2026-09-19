---
name: agentic-goals
description: Define, persist, resume, and pursue an explicit user-authorized goal across turns with success criteria and evidence. Use when the agent must keep pursuing an outcome over time.
---

# Agentic Goals

Turn an explicitly requested outcome into durable, evidence-backed pursuit state. Do not create a goal implicitly from an ordinary task.

## Pursue the goal

1. Confirm the objective in outcome language. Record measurable success criteria, constraints, authority boundaries, budgets, and an initial next action.
2. Create native goal state when the runtime exposes goal tools and the user explicitly requested goal pursuit. Otherwise maintain the JSON contract locally in the authorized workspace.
3. Select the narrowest execution protocol: use `agentic-loops` for adaptive serial work, `agentic-graphs` for dependencies and parallelism, or `council` for consequential judgment.
4. After each meaningful action, append evidence with source, result, affected criterion, freshness, and explicit `supersedes` lineage when replacing an earlier result. Use only the one current chain head per criterion to decide progress, so stale passes cannot mask newer failures. Update the next action from current evidence.
5. Resume by reading existing goal state first. Preserve verified progress and do not replay work unless evidence is stale or invalidated.
6. Mark complete only when every success criterion is explicitly verified and no required work remains.
7. Mark blocked only after occurrence records prove the same external blocker has prevented meaningful progress for at least three consecutive goal turns ending at the current `turns_used`, and recorded evidence shows no safe alternative remains. Before that threshold, keep the goal active and pursue safe alternatives.

## Preserve lifecycle integrity

- Distinguish `active`, `complete`, and `blocked`. Transition an active goal to complete as soon as every criterion's current evidence passes. Do not use blocked for difficulty, uncertainty, slow work, or a nearly exhausted budget, and never block an already satisfied goal.
- Keep a specific `next_action` while active; clear it for complete or blocked state.
- Record assumptions separately from evidence and recheck drift-prone facts before relying on them.
- Do not expand authority through persistence. Request approval for destructive, external, security-sensitive, or costly steps when each arises.
- Surface budget use and residual risk. Never mark complete merely to end a run.

## Use bundled resources

- Read [`references/goal-contract.md`](references/goal-contract.md) before creating or migrating durable goal state.
- Start from [`templates/goal.json`](templates/goal.json), then validate with `python3 scripts/validate_goal.py <goal.json>`.
- Consult [`examples/migration-goal.json`](examples/migration-goal.json) for an active goal with partial evidence.
- Use [`evals/behavioral.jsonl`](evals/behavioral.jsonl) to test explicit creation, resumption, strict completion, and repeated-blocker semantics.

## Route adjacent work

- Route ordinary one-turn tasks directly to their domain owner.
- Route recurring improvement or experimentation programs without a user-declared durable goal to System `loops`.
