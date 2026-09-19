# Validation Template

## Date

YYYY-MM-DD

## Scope

Which reference file(s) or pattern categories are being validated?

## Checks

- [ ] Code examples compile or run against the current repo (check package versions, import paths)
- [ ] Checklists match current repo conventions (file structure, naming, tooling)
- [ ] External references and URLs are still reachable
- [ ] No duplicated or contradictory guidance across references in scope
- [ ] Patterns in `memory/semantic-patterns.json` that target these references are reflected

## Findings

| Reference | Issue | Severity | Action |
|-----------|-------|----------|--------|
| `references/X.md:42` | Example uses deprecated API | High | Update with correction marker |

## Actions

- [ ] Action 1 — `references/X.md` line N
- [ ] Action 2 — update `memory/semantic-patterns.json` confidence for `pattern_id`
