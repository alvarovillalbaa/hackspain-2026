# Example: Product Critique of a New Feature's UX

Artifact: "Saved Views" feature for a data table — lets users save filter/sort combinations. Reviewed: Figma prototype v3.
Goal it must serve: power users return to the same filtered slices daily without re-configuring.

## Verdict

Ship-blocking issues: 1 · Should-fix: 3 · Polish: 2. Core flow works, but discoverability and the destructive-delete path will generate support load.

## What works

- Saving is one click from the active filter state — low friction, matches the job.
- Saved views appear inline in the existing left rail; no new mental model.

## Ship-blocking

1. **No confirmation on delete, and delete sits next to "rename" in the same hover menu.** Users will lose carefully-built views. Add an undo toast (preferred over a modal — keeps flow fast).

## Should-fix

1. **Discoverability:** the "Save view" affordance only appears after a filter is applied, with no empty-state hint. First-time users won't know the feature exists. Add a one-time coachmark or persistent ghost button.
2. **No shared/team views.** Interviews said configs get passed around Slack manually. Even read-only sharing would remove a real pain. (Scope check with PM — may be v2.)
3. **Naming collision:** two views can have identical names with no warning, making the list ambiguous.

## Polish

1. Saved-view list has no ordering control (recency vs alphabetical).
2. Active-view indicator contrast is below AA against the rail background.

## Recommendation

Fix the delete safety net before ship; fast-follow discoverability and naming. Treat team sharing as a separate, validated bet.
