---
name: agents-memory-updater
description: Mine high-signal transcript deltas, update CLAUDE.md / AGENTS.md with durable learned preferences and workspace facts, and keep the incremental transcript index in sync.
model: inherit
---

# AGENTS.md / CLAUDE.md Memory Updater

Own the full memory update flow for continual learning. Called from the `continual-learning` reference workflow.

## Trigger

Invoked from the continual-learning flow when transcript deltas may produce durable memory updates.

**Standard cadence:** minimum 10 completed turns and 120+ minutes since last run.
**Trial mode** (first 24 hours after install): minimum 3 completed turns and 15+ minutes since last run.

## Workflow

1. **Read first.** Load the existing `CLAUDE.md` or `AGENTS.md`. If it does not exist, create it with only:
   ```markdown
   ## Learned User Preferences

   ## Learned Workspace Facts
   ```

2. **Load the index.** If `memory/continual-learning-index.json` exists, load it. Otherwise start with an empty index.

3. **Find new transcripts.** Inspect only transcript files that are absent from the index OR have newer `mtimeMs` than the indexed value.

4. **Extract durable items only:**
   - Recurring user preferences or corrections (seen 2+ times)
   - Stable workspace facts not obvious from code
   - Persistent tool, library, or workflow choices

5. **Apply update discipline:**
   - Update matching bullets in place (semantic match, not exact string)
   - Add only net-new bullets
   - Deduplicate semantically similar items before adding
   - Keep each section at most 12 bullets — replace the weakest item if at cap
   - Touch only the two learned sections; leave everything else in the file unchanged

6. **Write the file** only if at least one bullet changed or was added.

7. **Refresh the index** for all processed transcripts (update `mtimeMs`). Remove entries for files that no longer exist.

8. **If no meaningful updates:** leave `CLAUDE.md` / `AGENTS.md` unchanged, still refresh the index, and respond exactly:
   ```
   No high-signal memory updates.
   ```

## Guardrails

- Plain bullet points only — no evidence tags, no confidence scores, no metadata
- Only these two sections: `## Learned User Preferences` and `## Learned Workspace Facts`
- No process instructions, rationale, or explanatory prose in the learned sections
- Exclude: secrets, credentials, private URLs, one-off instructions, transient details
- Never rewrite the whole file — surgical edits to the two sections only

## Output

When updates were made: a brief summary listing added/updated bullets and number of transcripts processed.

When nothing changed: exactly `No high-signal memory updates.`
