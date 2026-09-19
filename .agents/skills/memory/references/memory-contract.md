# Memory Contract

Use this contract to interpret, cite, reconcile, and mutate durable memory without tying the workflow to one agent runtime.

## Claim record

For every claim that materially affects the answer, capture:

| Field | Meaning |
| --- | --- |
| `claim` | The smallest useful factual statement or preference. |
| `source` | Relocatable store name plus file, record, URI, or tool handle. |
| `recorded_at` | When the durable record was written, when available. |
| `observed_at` | When the underlying fact was observed, when available. |
| `scope` | User, team, workspace, repo, project, role, or global boundary. |
| `kind` | Direct evidence, user statement, authoritative rule, summary, or inference. |
| `freshness` | Current, plausibly stale, stale, or unknown for this task. |
| `confidence` | High, medium, or low, with a short reason when not high. |
| `conflicts` | Other claim handles that disagree or narrow applicability. |

Do not fabricate missing metadata. Mark it unknown and reduce confidence when it matters.

## Source precedence

Resolve a conflict with the following order, while respecting scope and authority:

1. Current verified observation in the target environment.
2. Current explicit user statement for the applicable scope.
3. Current authoritative living policy or owner document.
4. Specific, dated source evidence from the applicable scope.
5. A durable summary derived from cited evidence.
6. Inference.

More recent is not automatically more authoritative. A current repo config outranks a recent generalized summary about that repo. When sources remain equally credible, preserve both, explain the disagreement, and ask only if the choice blocks the task.

## Freshness checks

Judge freshness against the claim, not a universal time-to-live:

- Verify current people, roles, prices, schedules, laws, dependencies, deployments, branches, and runtime state before relying on stored values.
- Reuse stable architectural decisions, writing preferences, and historical outcomes when their scope still applies, but check for superseding owner docs.
- Treat undated records as unverified when time could change the answer.
- When verification is expensive or unavailable, identify the memory as unverified and potentially stale.

## Mutation record

A durable write must include the claim, source/evidence, date, scope, reason for persistence, and any superseded record. Keep correction history when the store supports it. Never silently rewrite evidence to match a conclusion.

Before promoting a candidate, use the repository [promotion matrix](../../../../references/docs/promotion-matrix.md). Runtime instructions belong in the active rule owner; project facts, fixes, lessons, raw sources, maintained knowledge, and skill improvements have different canonical owners.

## Privacy and reasoning boundary

- Do not persist secrets, credentials, access tokens, private keys, unnecessary personal data, or data outside the approved scope.
- Do not persist or reveal hidden chain-of-thought or private scratch reasoning. Store concise decisions, evidence, assumptions, and outcomes instead.
- Do not turn an inference about a person into a remembered fact. Preserve the evidence and label the inference.
