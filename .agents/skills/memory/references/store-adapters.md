# Runtime-Neutral Store Adapters

Discover capabilities first. A memory store may be a loaded context block, local files, a runtime-provided memory tool, a database, or a connected knowledge service. Use only adapters actually available and authorized in the current task.

## Discovery order

1. Inspect memory already loaded into the session and user-supplied sources.
2. Inspect the current repo's owner instructions and repo-local memory indexes.
3. Inspect exposed tool/resource catalogs for a memory-specific search or read capability.
4. Inspect runtime-local stores only when their path is known and within scope.
5. Ask for a missing location only after discovery cannot resolve it.

Do not probe unrelated workspaces, user homes, private connectors, or network services merely because they may contain useful history.

## Adapter capabilities

Record which operations the selected adapter supports:

| Capability | Required behavior |
| --- | --- |
| `discover` | Identify stores and scope without reading all content. |
| `search` | Query narrowly and return stable handles. |
| `read` | Retrieve exact records plus provenance metadata. |
| `write` | Create a scoped record only after explicit request/approval. |
| `update` | Preserve conflict or supersession history when possible. |
| `delete` | Target an exact record and prefer recoverability. |

Absence of a capability is a constraint, not permission to emulate it through an unrelated private source.

## Citation handles

Prefer the store's native stable handle. For files, use a path and line range when practical. For records, include the store, record ID or URI, and timestamp. For loaded summaries, name the summary and distinguish it from the underlying evidence it cites.

## Local inventory helper

`scripts/inventory_memory.py` performs a metadata-only scan under one explicit store root. It does not read file contents, descend into hidden directories, follow symlinks, or mutate the store. Its output is discovery evidence only; inspect relevant candidate files separately before relying on a claim.
