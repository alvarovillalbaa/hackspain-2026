# Loop State Contract

Use schema version `1.0`. Treat the state file as the durable handoff between iterations.

Use strict JSON: object keys must be strings and unique, and numeric values must be finite. Duplicate fields, `NaN`, and infinities are invalid rather than last-write-wins inputs.

## Core invariants

- Keep one observable goal and one or more stable acceptance-criterion IDs.
- Set budgets before the first action. `max_seconds` and `max_tool_calls` must be positive. `max_cost_usd: 0` permits work only while recorded cost remains zero; any positive spend reaches that cap. A positive cost cap is reached at equality or overage.
- Increment `iteration` only after an action is attempted; create at most one evidence record per iteration.
- Keep exactly one evidence record for every completed iteration from 1 through `iteration`; gaps make resume and no-progress checks ambiguous.
- Record the predicted or actual check in `verification`, then mark `progress` from evidence rather than optimism.
- Keep exactly one `acceptance_results` entry per criterion. A passing result must cite one or more existing evidence iterations.
- Keep spend cumulative and monotonic.
- Never record spend above a declared limit. Reaching a cap and satisfying every criterion in the same update may still produce `complete`; otherwise equality produces `exhausted`. Overage is invalid in every state and must be surfaced rather than normalized away.

## Status transitions

```text
planned -> running
planned | running -> complete | blocked | exhausted | cancelled
blocked -> running
```

`planned` is the true pre-action state: iteration 0, no action evidence, zero cumulative spend, no blocker, and no pending or denied approval.

Use `complete` as soon as every criterion passes with evidence. Use `exhausted` as soon as the iteration, time, tool-call, or positive cost budget is reached, or the last two consecutive attempts make no measurable progress. Use `blocked` for an external dependency or a required approval that is pending or denied, provided the loop is not already complete or exhausted. Use `cancelled` when the user or controller explicitly stops the loop.

Automatic transition precedence is `complete`, then `exhausted`, then `blocked`. A planned or running state that already satisfies one of those stop conditions is invalid. A pending or denied entry in `approvals` represents a required approval and therefore cannot remain in an active state.

Keep `next_action` non-empty in planned and running states. Use null in every terminal state. Keep `blocker` non-empty only while blocked.

## Resume rules

Read the state before inspecting the workspace. Revalidate cited artifacts if they can drift. Continue from `next_action`, or revise it with a recorded reason when new evidence invalidates it. Never repeat a failed action unchanged.
