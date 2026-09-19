# Council Contract

Use schema version `1.0`. Keep one immutable evidence pack and identify every item with a stable ID. Record source and `as_of` even for user-provided statements.

Use strict JSON: object keys must be strings and unique, and numeric values must be finite. Duplicate fields, `NaN`, and infinities are rejected before hashing or validation.

## Provenance and versioning

- Set `evidence_pack_id` to `evidence-sha256:<digest>`, where the digest is SHA-256 over the UTF-8 JSON encoding of the `evidence` array with keys sorted, no insignificant whitespace, and non-finite numbers forbidden.
- Set `manifest_id` to `council-sha256:<digest>` using the same canonical encoding over the entire manifest except `manifest_id` itself. The manifest hash therefore commits to the evidence-pack ID, status, spend, approvals, rounds, ruling, revision, and parent.
- Start at integer `revision: 1` with `parent_manifest_id: null`. Every non-draft state must be revision 2 or later and link the exact preceding `manifest_id`; later revisions require a valid, different parent content ID.
- Preserve `evidence_pack_id` when the evidence array is byte-independently canonical-equivalent. Any evidence addition, removal, edit, or reordering produces a new evidence-pack ID and a new manifest revision.
- Use `python3 scripts/validate_council.py --print-identifiers <manifest.json>` to calculate both IDs after editing. The command prints identifiers only and never mutates the file.

The validator proves current-content integrity and parent-field semantics. Verify parent existence by retaining the linked prior artifacts, as demonstrated by the three architecture examples.

## Lifecycle

- Use `draft` only before deliberation with zero spend; keep `rounds` and `dissent` empty, `ruling` null, and `blocker` null.
- Use `in_progress` after a round has started and while no stop condition applies. Partial submissions may be preserved in the latest round.
- Use `blocked` when an external dependency or a required approval prevents deliberation. Keep a concrete `blocker`; pending or denied approvals cannot remain `draft` or `in_progress`.
- Use `exhausted` when the time, cost, or tool budget is reached, or when a configured round limit below the two-round minimum has been consumed. Preserve rounds and evidence, but keep `ruling` null and `dissent` empty.
- Use `complete` only after at least two fully submitted rounds: round 1 `independent_analysis`, then one or more `critique` rounds.
- Require exactly one submission per persona in every completed round.
- Keep three to seven personas. Make lenses distinct and situation-specific.
- Declare `max_rounds`, `max_seconds`, `max_cost_usd`, and `max_tool_calls` before dispatch. Record cumulative elapsed seconds, cost, and tool calls in `spend`; no value may exceed its limit. A zero cost limit permits zero-spend work but is reached by any positive paid spend.
- Never append a round beyond `max_rounds`. A caller may deliberately configure one round; after that round completes, preserve the partial deliberation as `exhausted` because the two-round completion contract cannot be met.

Use automatic stop precedence `exhausted`, then `blocked`, for any council that is not already complete. Once two or more full rounds exist within budget, issue the controller ruling and atomically transition to `complete` instead of leaving the artifact `in_progress`.

## Deliberation

Give every persona the same question, constraints, and evidence. In the independent round, hide other submissions. In critique rounds, expose submissions without changing the evidence pack. Add new evidence as a new versioned manifest rather than silently rewriting an active round.

Every submission must cite evidence and name at least one failure mode and one observation that would disconfirm its position. Every critique must additionally state the strongest opposing point and a boolean `changed_position`; those critique-only fields are forbidden in the independent round. This structural distinction prevents copied independent answers from masquerading as critique.

Do not start round 2 or any later critique until every persona has submitted in the preceding round. Only the latest round may be partial in a preserved `in_progress`, `blocked`, or `exhausted` artifact.

Treat confidence as a number from 0 to 1. Confidence describes support for the stated position, not persona seniority. Reference only declared evidence IDs. Keep the rationale concise and user-visible; never request or store hidden chain-of-thought.

## Ruling

Let the controller issue exactly one ruling. Weigh correctness, evidence quality, constraints, reversibility, and downside. Do not compute the ruling from votes. Record cited evidence, confidence, an explicit assumptions array, and at least one concrete next action. Record dissent only when a persona still recommends a materially different decision after critique.

Keep workers read-only and approval-gated. Let the controller own the final artifact and any downstream mutation.
