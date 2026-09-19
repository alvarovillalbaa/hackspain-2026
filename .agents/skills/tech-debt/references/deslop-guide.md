# Deslop Routing Guide

Use the external `deslop` skill when generated-code residue, vague naming, noisy comments, weak error handling, or dead generated patterns are the primary problem. Use the local [`simplify`](../../simplify/SKILL.md) skill when the goal is less code or less indirection with behavior preserved.

## Deslop — remove low-quality code

**Goal**: raise the quality bar. Remove code that is vague, noisy, brittle, or unnecessarily complex.

### What counts as slop

- **Vague names**: `data`, `stuff`, `temp`, `foo`, `handle_thing`. Names should reveal intent and domain.
- **Noise**: commented-out code, debug prints, TODOs without tickets, redundant comments that restate code.
- **Weak error handling**: swallowing exceptions, bare `except`, generic "something went wrong" messages.
- **Magic values**: literals that affect behavior without a named constant or explanation.
- **Unnecessary complexity**: over-abstraction, speculative generality, convoluted control flow.
- **Inconsistency**: mixed patterns in the same file (error handling styles, naming schemes).
- **Dead or redundant code**: unused branches, duplicate logic, unreachable code.

### Deslop checklist

**Naming and intent**
- [ ] Every name reveals purpose and domain. No `data`/`stuff`/`temp`/`thing`.
- [ ] Function names are verbs describing what the function does.
- [ ] Booleans read clearly: `is_valid`, `has_permission`, not `flag` or `check`.

**Error handling**
- [ ] No bare `except:` or silent catch-and-ignore without documented reason.
- [ ] User/API-facing errors have clear, actionable messages.
- [ ] Critical failures are logged; no logging noise for normal flow.

**Clarity and structure**
- [ ] No commented-out code.
- [ ] No debug prints.
- [ ] No magic numbers/strings — use named constants.
- [ ] Control flow uses guard clauses and early returns. No deep nesting without justification.

**Consistency**
- [ ] Matches project style (formatting, type hints, docstrings).
- [ ] Uses project patterns (services for logic, serializers for validation, unified access checks).
- [ ] No duplicate logic that already exists in shared code.

**Dead code**
- [ ] No unreachable code.
- [ ] No functions that only forward arguments with no logic.
- [ ] Unused imports and variables removed.

### What NOT to do with deslop

- Change behavior for style reasons.
- Over-engineer ("adding abstraction for quality").
- Rewrite everything at once — prefer targeted fixes.
- Skip running tests after cleanup.

## Workflow

1. Scope the target: file, function, directory, or current diff.
2. Run the deslop checklist.
3. Implement targeted fixes — prefer small, reviewable changes.
4. Run `pytest -q` and `ruff check .` on the changed scope.
5. Report: slop list (file/line, severity), edits made, verification reminder.

## Output format

```
## Findings

### Correctness/Safety
- [file:line] Issue description

### Clarity
- [file:line] Issue description

### Dead code
- [file:line] Issue description

## Changes made
- [file]: [brief summary of edit]

## Verification
Run: pytest -q && ruff check .
```
