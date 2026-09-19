# Documentation Types Reference

Last updated: 2026-08-07

How to pick a documentation surface and what each type is for.

This reference does **not** define the AFS taxonomy, paths, or timestamp format. `use-afs` owns
those; if it is not installed, stop AFS-pathed work and report the install command. Local deltas
live in [`../../../../references/docs/afs-profile.md`](../../../../references/docs/afs-profile.md).

## Surfaces

Documentation falls into these surfaces:

1. Inline docs
2. In-folder docs
3. Root instruction docs
4. AFS surfaces (memory, operational, and source-of-truth)

Default rule: choose the narrowest authoritative surface first.

## Inline docs

Use inline docs for public functions, classes, methods, hooks, components, modules, and non-obvious
code behavior that should be visible without leaving the editor.

Prefer type annotations over prose when types can carry the meaning cleanly.

## In-folder docs

These explain one directory or subsystem. The core / conditional / rare sets and each file's intent
are defined in the [AFS profile](../../../../references/docs/afs-profile.md#in-folder-documentation-contract).

They are living docs — add `Last updated: YYYY-MM-DD` near the top. They stay beside the code they
describe and are never relocated into `docs/`.

## Root instruction docs

The UPPERCASE Markdown files at the repo root are first-class documentation. `use-afs` owns the
canonical set and each file's purpose — read it before creating, renaming, or routing content into
one.

They stay at the repo root even when the rest of the AFS shell lives in `docs/`, and they are living
docs: add `Last updated: YYYY-MM-DD` near the top.

## AFS surfaces

Ask `use-afs` for:

- which surfaces exist and what each is for
- which are timestamped and which are living
- the exact path and date format for a destination
- where the shell lives for this repo's installation profile (application repos use `docs/`)

Do not reconstruct any of the above from memory or from folders that happen to exist in the repo.

## Time-based vs live conflicts

Use this rule whenever docs overlap:

- timestamped docs own history
- living docs own the current rule

Good split:

- a dated implementation plan explains one implementation effort
- the root instruction doc that owns planning explains the lasting repo-wide standard

Bad split:

- current operational instructions duplicated in both an audit and a runbook
- current repo rules duplicated in both a lesson and `AGENTS.md`

When conflicts exist:

1. Move the durable rule into the right living doc.
2. Keep the timestamped doc only as evidence or archive.
3. Delete redundant drift when it adds no value.

## Decision guide

Use this routing sequence:

1. If the reader needs the answer inside code, use inline docs.
2. If the doc explains one folder, use in-folder docs.
3. If the doc changes how the repo is operated, use a root instruction doc.
4. If the artifact is historical, investigative, or event-like, use a timestamped AFS surface.
5. If the artifact is the current durable truth, use a living AFS surface.

For steps 4 and 5, resolve the concrete path through `use-afs`.
