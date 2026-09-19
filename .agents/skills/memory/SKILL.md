---
name: memory
description: Retrieve, reconcile, and curate durable agent memory across available runtimes. Use when prior decisions or cross-session facts may matter, or to save/update/delete a memory.
---

# Memory

Use durable memory as scoped evidence from an earlier moment, never as unquestioned current truth. Discover the stores actually available in the current runtime, retrieve only what the task needs, and keep all mutation approval-gated.

## Workflow

1. Define the query, workspace, user, time horizon, and sensitivity boundary. Do not search unrelated projects or private connectors.
2. Discover available stores instead of assuming a vendor or path. Start with memory already loaded for the session, repo-local sources, and exposed read/search tools. Read [`references/store-adapters.md`](references/store-adapters.md) when selecting a store.
3. Retrieve narrowly with task-specific terms. Prefer indexes and targeted searches over loading whole stores. For an explicitly scoped local root, use `python3 scripts/inventory_memory.py ROOT` to inventory likely files without reading their contents.
4. Evaluate every relevant claim using [`references/memory-contract.md`](references/memory-contract.md): record its source, date, scope, evidence kind, freshness, and conflicts. Separate stored evidence from present inference.
5. Verify drift-prone claims when verification is safe and proportionate. A current observation wins over an older memory; report the conflict rather than blending both into false certainty.
6. Answer with the minimum relevant context and citations or retrieval handles. State stale, conflicting, incomplete, or unverified evidence plainly.
7. Mutate only after an explicit user request and any runtime approval required for the action. Before promotion, read [`../../../references/docs/promotion-matrix.md`](../../../references/docs/promotion-matrix.md) and route the item to its canonical owner.

## Retrieval Contract

- Cite enough provenance to relocate the evidence: store or source, path/record handle, observed or recorded date, and applicable scope.
- Treat summaries, recollections, and model-generated notes as claims. Label inferences and confidence separately from source evidence.
- Prefer the most specific applicable scope. A workspace rule does not automatically become a global user preference.
- Exclude credentials, secrets, hidden chain-of-thought, private scratch reasoning, and unrelated personal data from retrieval output and durable storage.
- If no suitable store is available or evidence is insufficient, say so. Never invent a remembered fact.

## Mutation Gates

- **Read/search:** stay inside the user's current scope. Access a new private connector, mailbox, calendar, another workspace, or global store only when explicitly requested or already authorized for this task.
- **Write/update:** require an explicit request naming what should persist. Check for duplicates and conflicts first; preserve provenance and reason.
- **Promote:** require explicit approval, use the promotion matrix, and keep candidate evidence separate until adopted.
- **Delete/overwrite:** require explicit approval and an exact target. Prefer a recoverable correction or superseding record; never bulk-delete.
- Never infer authorization to mutate from a request to recall, inspect, explain, or recommend.

These mutation gates are instructions, not hook behavior. Runtime approval
state cannot be inferred by a portable shell script; the acting runtime must
bind each mutation to trusted user-interaction evidence.

Use [`templates/memory-report.md`](templates/memory-report.md) for retrieval or health reports. See [`examples/conflicting-memory-resolution.md`](examples/conflicting-memory-resolution.md) for the expected evidence-versus-inference treatment.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `brain`
- `knowledge-base`
- `learning`
- `lessons`
- `code-documentation`

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
