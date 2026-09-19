# Work Graph Contract

Use schema version `1.0`. Keep one controller as `integration_owner`; workers own nodes, never the graph itself.

## Node contract

Give each node a stable ID, one objective, explicit dependencies, an owner capability, observable acceptance checks with one boolean result per check, write scopes, lifecycle status, artifact IDs, a handoff packet, and retry counters. Use `replaces` when a replan supersedes an earlier node.

Treat write scopes as canonical relative hierarchical resource names. Reject leading or trailing whitespace, absolute, drive, or home-prefixed paths, backslashes, percent-encoded aliases, duplicate separators, Unicode normalization aliases, and `.` or `..` segments. Compare valid scopes case-insensitively: a scope overlaps when it is identical to or nested under another scope. Serialize overlapping writes even when dependency edges would otherwise permit parallel execution.

## Scheduling

- Use `planned` before dependencies are satisfied.
- Use `ready` only after every dependency is complete.
- Use `running` only while an assigned worker is active.
- Use `complete` only after every per-criterion acceptance result passes and a complete handoff packet exists. Conversely, once both are present, the node must transition to `complete` rather than remain planned, ready, running, failed, or blocked.
- Use `failed` after a rejected handoff cannot be retried safely or within budget.
- Use `blocked` for an external dependency or approval.
- Use `superseded` only when a controller revision lists that node in `superseded_nodes`. This state is historical and non-dispatchable; a superseded node must never remain planned, ready, or running.

Reject missing dependencies, self-dependencies, and cycles. Revalidate after adding, removing, splitting, merging, or rewiring nodes.

## Handoffs and replans

Require every handoff to identify non-empty verification evidence and changed artifacts, plus arrays for residual risks and newly discovered work. Every verification or changed artifact must occur in the node's declared `artifacts`. Add discovered work through a controller-authored revision. Preserve revision IDs, reasons, added node IDs, and superseded node IDs; reject references to nonexistent nodes or repeated add/supersede declarations. A node's `replaces` value is valid only when one revision adds that node and supersedes the referenced predecessor. Revisions are ordered: an earlier revision must introduce a node before a later revision can supersede it, and replacement lineage must remain acyclic. Stop any active worker for a superseded node, mark that node `superseded`, and rewire live nodes away from it. Retain superseded nodes as history, but exclude them from live-node completion and failure decisions.

Use `planned` only while every node is planned and no global result or verification evidence has passed. Mark the graph complete only when every live node is complete, each global acceptance result is true, and `global_verification` contains integration-owner evidence against the assembled artifact that is declared by a live graph node. A fully verified graph cannot remain `running`. The validator rejects duplicate JSON fields, non-finite numbers, and wrong-typed lifecycle fields instead of coercing them.
