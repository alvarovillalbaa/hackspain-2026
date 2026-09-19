---
name: agentic-loops
description: Run a bounded inspect-act-verify-adapt loop that picks the next action until acceptance criteria are met or the budget runs out. For implementation, debugging, and investigation.
---

# Agentic Loops

Drive a concrete task to completion through short, auditable cycles. Keep every loop human-started, bounded, reversible where possible, and subject to ordinary approval rules.

## Execute the loop

1. Record the goal, observable acceptance criteria, constraints, current state, and budgets for iterations, elapsed time, cost, and tool calls.
2. Inspect the smallest evidence surface that can reveal the next high-value action.
3. Choose one hypothesis or action. Predict the signal that would count as progress before acting.
4. Act within scope. Keep the change small enough to attribute the observed result.
5. Verify against the real acceptance criteria, not a proxy. Record action, observation, verification, artifacts, spend, and whether measurable progress occurred.
6. Adapt the next action from the new evidence. Do not repeat an unchanged failed action.
7. Stop immediately when every acceptance criterion passes, an approval boundary is reached, the user cancels, the iteration/time/tool/cost budget is reached, or two consecutive iterations show no progress without a new hypothesis. A zero cost cap permits zero-spend work but is reached by any positive recorded spend.

## Maintain state

- Use `planned`, `running`, `complete`, `blocked`, `exhausted`, or `cancelled` exactly as defined in [`references/loop-state-contract.md`](references/loop-state-contract.md).
- Mark `complete` only with recorded passing evidence for every acceptance criterion.
- Mark `blocked` only for an external dependency or approval that prevents a useful next action. Use `exhausted` for budget or no-progress termination.
- Apply automatic stop precedence consistently: `complete`, then `exhausted`, then `blocked`. Never leave a stop condition in `planned` or `running`.
- Keep one evidence record for every completed iteration so budget and no-progress decisions can be reproduced.
- Use `planned` only before any action: iteration 0, empty evidence, zero spend, and no pending or denied approval.
- Never accept cumulative spend above any declared cap, even in `complete`; exact-cap completion is valid only when all criteria pass in that same state update.
- Persist a concrete `next_action` while planned or running; clear it for terminal states.
- Resume from the recorded evidence and next action instead of replaying completed work.

## Use bundled resources

- Start from [`templates/loop-state.json`](templates/loop-state.json).
- Validate state with `python3 scripts/validate_loop_state.py <state.json>` after each handoff and before claiming completion.
- Consult [`examples/debug-loop.json`](examples/debug-loop.json) for a completed recovery loop.
- Use [`evals/behavioral.jsonl`](evals/behavioral.jsonl) to test convergence, exhaustion, approval, and completion behavior.

## Preserve boundaries

- Route durable, repeatable improvement, evaluation, monitoring, memory, or experimentation programs to System `loops`. This skill owns dynamic execution of one concrete task.
- Route dependency-rich parallel work to `agentic-graphs`, persistent cross-turn objectives to `agentic-goals`, and multi-perspective deliberation to `council`.
- Require approval per iteration for destructive, externally visible, security-sensitive, or costly actions; prior loop approval never grants blanket authority.
