# Drive-Backed Evidence Ops

Use this reference when finance work needs a stable evidence trail across
statements, receipts, workpapers, decks, and reviewer comments.

## Goal

Keep one canonical artifact set per period and entity so reconciliations, close
tasks, and fundraising materials all point to the same evidence.

## Default Folder Pattern

Use a predictable structure such as:

`Finance/<Entity>/<YYYY>/<YYYY-MM> {Close|Reconciliation|Fundraising}/`

Suggested subfolders:

- `01-source-docs`
- `02-workpapers`
- `03-outputs`
- `04-review`

## Operating Rules

- Search for the existing folder or file before creating a new one.
- Prefer updating or commenting on an existing workpaper over spawning a near
  duplicate.
- Store source documents separately from generated outputs.
- Put period and entity in filenames.
- If a file is shared for review, use comments or replies to preserve decision
  history instead of creating ad hoc side documents.
- Only copy/export files when the downstream consumer requires a separate
  format.

## Useful Drive Actions

Patterns adapted from the `gws-drive` skill:

- inspect available methods before building requests
- search files and folders with query parameters
- create or copy files when a canonical artifact is missing
- upload/download/export artifacts for workpapers and evidence packs
- list and manage permissions on shared close folders
- use comments and replies for reviewer questions
- inspect revisions when a finance file changed unexpectedly

The `gws-drive` skill emphasizes discovering commands before acting:

- `gws drive --help`
- `gws schema drive.<resource>.<method>`

If the user already has a Google Drive connector or Drive-specific tools, use
those first. If the task is CLI-based, the `gws-drive` pattern is:

1. inspect the method schema
2. search before create
3. update only the fields you intend to change
4. preserve comments, permissions, and revision context

## Minimum Evidence Fields

For reconciliation and close outputs, preserve:

- source file link
- extracted period or statement date
- entity
- preparer
- reviewer, if known
- generated workpaper link
- unresolved comment or blocker link, if any

## Failure Modes

Watch for:

- multiple copies of the same statement or workpaper
- receipt links that point to local temp paths instead of durable storage
- reviewers leaving feedback in chat while the artifact remains unchanged
- period folders mixing entities or currencies
- exported files becoming stale while the live shared file keeps changing
