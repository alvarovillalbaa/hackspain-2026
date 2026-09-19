# Changelog Entry Template

Two separate changelogs serve different audiences. Use this template for both, but write completely different content.

---

## Customer-Facing Changelog

**Location:** `CHANGELOG.md` at the service or package root (not in `docs/`). For libraries/packages this is often the repo root.

**Write after release is live. Use plain language — no code names, no error codes, no class names.**

```markdown
## [YYYY-MM-DD] — [Optional Release Name]

### New
- [Feature in plain language — focus on user benefit, not implementation]
- [Feature 2]

### Improved
- [Improvement — what's better and how much better]
- [Improvement 2]

### Fixed
- [Bug fix — describe the problem that was fixed, not the code that changed]
- [Bug fix 2]

### Removed
- [Removed feature — what to use instead]
```

### Customer-Facing Examples

```markdown
## 2026-03-08 — Spring Release

### New
- Job matching now considers candidate work preference (remote, hybrid, on-site) when scoring roles
- Recruiters can now bulk-assign candidates to pipeline stages from the list view
- Notifications now support digest mode — receive a daily or weekly summary instead of per-event emails

### Improved
- Candidate search is 3× faster on large datasets (500+ candidates)
- The dashboard now loads in under 1 second on all supported browsers
- Attachment upload now shows real-time progress and supports files up to 100MB

### Fixed
- Fixed an issue where some users saw duplicate notifications after reconnecting their Slack integration
- Fixed a layout issue in the sidebar navigation on screens narrower than 1024px
- Fixed an issue where scheduled jobs occasionally ran twice within a single 24-hour window

### Removed
- Removed the legacy CSV export format — use the Excel export instead (includes all fields)
```

---

## Internal Engineering Changelog / Release Notes

**Location:** Part of the release PR description, or `release-notes.md` in the AFS audit surface.

**For engineers — can include technical details, migration steps, breaking changes.**

```markdown
## Release YYYY-MM-DD

### Breaking Changes
- [API change with migration path]
- [Environment variable rename: OLD_VAR → NEW_VAR]

### New Features
- [Feature] — [Service/file changed] — [PR link]
- [Feature 2] — [PR link]

### Bug Fixes
- [Fix description] — [Root cause brief] — [PR link]

### Performance
- [Improvement] — [Measurement: before → after] — [PR link]

### Refactors (no behavior change)
- [Refactor] — [What changed internally] — [PR link]

### Migrations
- [Migration name] — [Auto/manual, estimated duration, requires downtime?] — [PR link]

### Dependencies
- Bumped [package] from [v1] to [v2] — [Why, breaking changes if any]

### Configuration Changes
- Added `[ENV_VAR]` — [Purpose, default value, required/optional]
- Renamed `[OLD_ENV_VAR]` → `[NEW_ENV_VAR]` — [Must update .env before deploying]
```

---

## Language Guide

### What to say vs. avoid

| ❌ Technical (customer changelog) | ✅ User-focused |
|---|---|
| "Migrated CandidateSerializer to RetrievalLevelMixin" | "Improved loading time for candidate profiles" |
| "Fixed N+1 query in JobListView" | "Job listings now load faster for companies with many open roles" |
| "Added GinIndex on search_vector" | "Search results appear more quickly" |
| "Removed deprecated JobSkillLink model" | "Skill matching has been unified — no action required" |
| "Implemented webhook retry with exponential backoff" | "Integrations are now more reliable — fewer missed events during service disruptions" |

### Verb guide for customer changelogs

- **New:** "Recruiters can now...", "Job matching now...", "Added support for..."
- **Improved:** "X is now 3× faster", "Y now supports...", "Z has been simplified"
- **Fixed:** "Fixed an issue where...", "Resolved a problem that caused..."
- **Removed:** "Removed [X] — use [Y] instead"

### Tone

- Present tense ("Job matching now considers...")
- Active voice ("Recruiters can now...")
- Concrete over vague ("3× faster", not "significantly faster")
- User benefit over feature description ("See which candidates match before reaching out" not "Added match score display")
