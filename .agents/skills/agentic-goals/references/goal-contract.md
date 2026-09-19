# Goal Contract

Use schema version `1.0`. Create this contract only after the user explicitly asks the agent to pursue a durable goal.

## Identity and evidence

Keep `goal_id` and success-criterion IDs stable across turns. Express the objective as an outcome, not a task list. Separate constraints, assumptions, and evidence.

For every evidence item, cite its source, affected criterion, result, `as_of` date, verification state, pass decision, and `supersedes` ID or `null`. A replacement must point to earlier evidence for the same criterion. The unsuperseded chain head is authoritative; require at most one current head per criterion so an old pass can never mask a newer fail. Recheck drift-prone evidence before using it to complete a criterion. Keep budget use cumulative.

## Lifecycle

- Use `active` while meaningful in-scope work remains. Keep a concrete `next_action`. An active state is invalid once all current criterion evidence passes.
- Use `complete` only when the one current evidence head for every criterion is verified and passing. Clear `next_action` and `blocker`.
- Use `blocked` only after occurrence records show the same blocker fingerprint on at least three consecutive goal turns ending exactly at `budget.turns_used`, and `no_safe_alternative_evidence` explains what was tried and why no meaningful safe alternative remains. Clear `next_action` and retain the blocker audit. A blocked state is invalid if every criterion currently passes.

Each blocker occurrence records `turn_index`, the matching `fingerprint`, `observed_at`, and concrete `evidence`. While the current blocker history has one or two consecutive occurrences, keep the goal active and record the best safe alternative as `next_action`. Reset the occurrence audit when the blocker changes or progress resumes.

Do not convert budget exhaustion, uncertainty, difficulty, or slow progress into completion. Do not expand the user's authority boundary as the goal persists. Reject duplicate JSON fields, wrong-typed lifecycle fields, and non-finite numbers instead of coercing them.

## Runtime tools

Prefer native goal lifecycle tools when available. Create only an explicitly requested goal, update evidence after meaningful work, and use complete or blocked transitions exactly as the runtime defines. Use this JSON contract as a portable handoff or validation surface, not as a competing hidden state store.
