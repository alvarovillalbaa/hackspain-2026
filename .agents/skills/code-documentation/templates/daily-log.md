# Daily Log Template

Development logs go in the AFS log surface — ask `use-afs` for the path. Always append to the change log in the latest date directory; create the directory and file only when today's does not exist yet.

---

## Format

```
- [What changed and why] — [Context or problem solved, if not obvious]
```

One bullet per logical change. One or two lines maximum. Past tense. Active voice.

---

## Examples

### Feature additions
```
- Added retry logic to MCP handshake — Anthropic endpoint returns 503 on cold start
- Implemented candidate deduplication in import pipeline — was creating duplicate profiles on re-import
- Added `level` query param to /api/candidate/ — enables callers to choose response verbosity
```

### Bug fixes
```
- Fixed OAuth token refresh by adding missing redirect URI validation — was causing silent login failures on mobile
- Fixed N+1 query in JobListView — added select_related('company', 'location') to queryset
- Fixed race condition in notification dispatch — added task_id deduplication check before enqueuing
```

### Refactors
```
- Refactored CandidateSerializer to use RetrievalLevelMixin — removed ad-hoc to_representation override
- Moved candidate enrichment logic from view into CandidateService — was incorrectly in view layer
- Consolidated duplicate MCP connection logic into MCPConnectionPool singleton
```

### Config / infra changes
```
- Bumped OpenAI SDK to 1.35.0 — required for structured output support in streaming mode
- Increased Celery worker pool size from 4 to 8 on `async` queue — was bottlenecking bulk imports
- Added SENTRY_TRACES_SAMPLE_RATE env var — enables configurable APM trace sampling without deploy
```

### Documentation
```
- Added ARCHITECTURE.md for services/mcp — documents connection lifecycle and tool filtering
- Split historical implementation plans from the living desired-state contract — removed duplicate truth
```

---

## Anti-patterns to Avoid

```
❌ - Did some refactoring
❌ - Fixed a bug
❌ - Updated code per review feedback
❌ - WIP
❌ - Various improvements
❌ - Code review changes
```

These are not useful to anyone — they contain no searchable information.

---

## Finding the Latest Log File

```bash
YEAR=$(ls logs/ | sort | tail -1)
DATE_DIR=$(ls logs/$YEAR/ | sort | tail -1)
echo "- Your log entry here" >> logs/$YEAR/$DATE_DIR/changes.md
```

Or use: `skills/code-documentation/scripts/find-docs.sh log`
