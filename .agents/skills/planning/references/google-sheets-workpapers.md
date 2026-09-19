# Google Sheets Workpapers

Use this reference when the finance workflow is best managed as a spreadsheet
instead of a memo or ad hoc CSV set.

This pattern is adapted from `gws-sheets`: inspect structure first, prefer
validated batch updates, and keep changes atomic.

## When To Use A Sheet

Prefer a sheet when the user needs:

- row-based trackers
- owner and due-date workflows
- repeated updates across the same artifact
- formulas or rollups that should stay live
- multi-person review on one canonical file

## Operating Pattern

1. inspect the existing workbook, tabs, and protected logic before editing
2. search for an existing tracker before creating a new one
3. separate raw imports from reviewed or presentation tabs
4. make grouped updates instead of scattered single-cell edits
5. verify formulas, validations, and comments survived the change

## Atomic Update Discipline

When the client supports batch or grouped updates:

- prefer one validated update set over many small writes
- fail the whole change if the target layout is not what you expected
- avoid overwriting formulas with values
- preserve comments and reviewer notes

## Suggested Tracker Layouts

### Bill calendar

Columns:

- `biller`
- `amount`
- `currency`
- `due_date`
- `autopay`
- `owner`
- `status`
- `last_seen_date`
- `source_link`
- `next_action`

### Reconciliation tracker

Columns:

- `item_id`
- `recon_type`
- `statement_balance`
- `book_balance`
- `difference`
- `exception_category`
- `owner`
- `status`
- `evidence_link`
- `next_action`

### Tax document checklist

Columns:

- `category`
- `document_name`
- `status`
- `source`
- `path_or_link`
- `notes`
- `reviewer`

## Connector Notes

If a Google Sheets connector or CLI exists:

- inspect method schemas before building requests
- read the target ranges first
- update only the fields you intend to change
- use append helpers only for additive logs, not structured trackers that rely on formulas

If no connector exists, follow the same discipline with local spreadsheets.
