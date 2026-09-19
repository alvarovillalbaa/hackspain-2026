# Continuous Documentation Reference

Last updated: 2026-08-07

Continuous docs are maintained as part of normal work. They do not wait for a special documentation
project.

This reference covers **what belongs in each artifact and what good looks like**. It does not define
where they live — ask `use-afs` for every path and date format. If `use-afs` is not installed, stop
AFS-pathed work and report the install command.

## Development logs

Append to the change log for the current date rather than creating a parallel file. Resolve the path
with `use-afs`, or use `scripts/find-docs.sh log` to locate the current one.

### Format

One bullet per logical change. Two lines maximum.

```text
- [What changed] — [Why it changed or what problem it solved]
```

### Good examples

```text
- Fixed OAuth token refresh by adding redirect URI validation — silent mobile login failures stopped
- Refactored candidate serializer to use RetrievalLevelMixin — removed ad-hoc response shaping
- Split historical implementation plans from the living behavior contract — removed duplicate truth
```

### Anti-patterns

```text
- Did some refactoring
- Fixed a bug
- Updated code per review
- WIP
```

## Lessons

Write a lesson when:

- the insight was verified by real work
- it should change future behavior
- it is broader than one incident note

Keep lessons concise, evidence-backed, and action-shaping.

## Facts

Record a fact when:

- it is about the user, team, company, customer, environment, or project context
- future agents or engineers would make wrong assumptions without it
- it is not cleanly derivable from code alone

AFS separates facts by type — durable named facts, session-scoped episode records, and atomic
subject–predicate–object claims. Ask `use-afs` which type applies and where it goes.

Do not record transient requests or secrets as facts.

## Fixes

Write a fix when:

- the error or symptom was non-obvious
- the fix is likely to recur
- the next person should not have to rediscover it from scratch

Each fix should capture the symptom, root cause, exact fix, and a prevention note when useful.

## Plans

Plans are historical implementation artifacts. They explain how a specific change should be
executed, tested, and verified at that time.

If the rule becomes durable and repo-wide, promote it into the root instruction doc or living
source-of-truth surface that owns it.

## Audits

Use for technical reports, ADRs, post-mortems, architecture audits, dependency or security reviews,
and engineer-facing release notes.

These are historical by design. They should not become the only place where a lasting workflow or
policy lives.

## Raw material

Raw intake is not the final home. Use it for copied source material, imported notes, scraped pages,
and temporary ingest batches waiting for compilation.

After ingest, promote durable knowledge into the canonical living destination and clear or archive
the raw entry according to the repo's brain rules. See
[`../../../../system/skills/ingestion/SKILL.md`](../../../../system/skills/ingestion/SKILL.md).

## Living docs

Living docs own the current truth and must include:

```markdown
Last updated: YYYY-MM-DD
```

Which surfaces are living is an AFS question. The freshness rule itself is local — see the
[AFS profile](../../../../references/docs/afs-profile.md#living-doc-freshness).

## Changelogs

Two changelog audiences still exist:

- `CHANGELOG.md` for user-facing or package-facing release history
- engineer-facing release notes in the AFS audit surface, or PR descriptions

If `CHANGELOG.md` is treated as a living repo doc, add `Last updated: YYYY-MM-DD` near the top.

## Conflict check

Before writing:

1. Check whether the same guidance already exists in a living doc.
2. If yes, update the living doc and keep the timestamped artifact as history only.
3. If the old location is obsolete, move or delete it instead of creating a second current source of
   truth.
