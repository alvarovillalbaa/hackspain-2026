# Code Review Checklist

Actionable checklist for PR reviews. Run `git diff` locally before reviewing any diff.

## Pre-review checks (author)

```bash
ruff check .          # lint
ruff check --fix .    # lint auto-fix
ruff format .         # format
pytest -m unit path/  # unit tests
python manage.py makemigrations --dry-run  # migration check
```

## Review categories

### 1. Correctness and functionality

- Does the code implement the stated behavior?
- Are edge cases handled (empty inputs, None, invalid values)?
- Are return values and side effects explicit and tested?
- For async code: no blocking I/O in async functions?
- Does the implementation solve the underlying problem, not just the symptom?

### 2. Tests

- Tests cover the changed behavior (unit/integration as appropriate)?
- Tests assert behavior, not implementation details?
- Negative/error paths tested for new features?
- Bug fixes include a regression test?

### 3. Code quality and readability

- Small, focused functions; descriptive names?
- Simple control flow (guard clauses, early returns)?
- No duplicate code?
- Docstrings and comments only where they add essential context?
- No commented-out code?

### 4. API, contracts, and backwards compatibility

- Public API changes documented and versioned if required?
- Serializer/contract changes coordinated with clients or behind feature flags?

### 5. Security and data handling

- No hard-coded secrets or credentials?
- Input validation for external inputs (API payloads, files, query params)?
- Safe defaults for permissions and access checks?
- No injection risks (SQL, shell, template)?

### 6. Database and migrations

- Model changes include a migration?
- Migration is safe at scale (no large table scans; use background migrations)?
- Queries use `select_related`/`prefetch_related` where appropriate?

### 7. Performance and scalability

- Algorithm complexity acceptable for worst-case input?
- Loops over querysets batched or streamed?
- Caching keyed with versioning?

### 8. Observability and logging

- Structured logs for unexpected failures (not normal success)?
- `log_error`/`log_warning` only for critical issues?
- Log entries include structured `extra_data` with ids and counts?

### 9. CI and dependencies

- CI must pass (lint, format, tests, build)?
- New dependencies in `requirements.txt`/`pyproject.toml` with rationale?

### 10. Documentation

- `docs/` updated when behavior or configuration changes?
- User-facing changes have screenshots or API examples in the PR?

## PR metadata requirements

- Title: short, imperative, scoped: `feat(jobs): add bulk-import endpoint`
- Description: explains *why*, not just what
- Includes: migrations, config changes, security considerations, testing instructions
- Conventional commit prefixes: `feat:`, `fix:`, `chore:`

## Red flags

- Diff >500 lines without justification → ask to split
- Schema change that drops columns/tables → require migration plan
- Secrets in diff → immediate removal and rotation required
- Flaky test failures → block merge until resolved

## Severity-based review focus

When time is limited, prioritize in order:
1. Correctness/security
2. Tests
3. API contracts
4. Style and readability

## Approval thresholds

- 1 approver: low-risk fixes, typos, tiny refactors
- 2 approvers: features, DB changes, behavioral changes
- 3+ approvers + security review: infra, secrets, major design changes

## Quick command cheat sheet

```bash
git status
git diff
git diff --staged
git add -p               # interactive staging
ruff check . && ruff format . --check
pytest -q
python manage.py makemigrations --dry-run
```

## Multi-agent code review workflow

For deep pre-merge reviews, run 5 parallel review agents:

1. **CLAUDE.md compliance**: check project-specific rules
2. **Bug detection**: shallow scan, focus on large bugs, skip linter-catchable issues
3. **Git history context**: read blame/history for related past bugs
4. **Prior PR comments**: find patterns from previous reviews on same files
5. **Code comment compliance**: check changes comply with inline guidance

Score each finding 0–100 confidence:
- <80: do not surface
- 80–90: important
- 91–100: critical

False positives to exclude: pre-existing issues, linter-catchable problems, intentional behavior changes, issues on unmodified lines.
