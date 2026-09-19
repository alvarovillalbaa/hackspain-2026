# PRD to Architecture Plan

Use this reference only to turn a PRD into a repo-local architecture plan. Use external `codex-loop` or `claude-loop` for story execution loops, worker orchestration, progress tracking, and archive/worktree handling. Use external `tdd` for vertical test-first tracer-bullet mechanics.

Keep the PRD itself product-focused. Only promote technical hints into this architecture plan after the product behavior, scope, and acceptance criteria are clear.

Install fallbacks:

```sh
python3 scripts/install-external-skills.py --skill codex-loop --agent codex
python3 scripts/install-external-skills.py --skill claude-loop --agent codex
python3 scripts/install-external-skills.py --skill tdd --agent codex
```

## Local owner boundary

This file owns:

- durable route, schema, model, and boundary decisions
- plan file placement and architecture headers
- acceptance criteria tied to the local repo
- explicit handoff to execution-loop and TDD owners

It does not own:

- `prd.json` loop format
- fresh-agent worker prompts
- dependency-wave execution
- progress/archive/worktree protocol
- red-green-refactor or tracer-bullet testing methodology

## Process

1. Confirm the PRD is in context or ask for the file.
2. Explore the current codebase enough to identify existing patterns and integration boundaries.
3. Record durable decisions that should not drift during implementation:
   - routes and URL shapes
   - schema and data-model names
   - authorization boundaries
   - external service contracts
   - observability or rollback requirements
   - any explicit hard-cut decisions, including rejected compatibility shims or backfills
4. Draft a plan in `./plans/<feature>.md` with phases, acceptance criteria, and verification notes.
5. For execution, hand the approved plan to `codex-loop` or `claude-loop` when the work is PRD/story based.
6. For behavior changes inside a phase, invoke `tdd` instead of expanding local test-first instructions.

## Plan Template

```markdown
# Plan: <Feature Name>

> Source PRD: <identifier or link>
> Execution owner: codex-loop | claude-loop | inline
> Test-first owner: tdd when behavior changes require it

## Architectural Decisions

- **Routes**:
- **Schema**:
- **Key models**:
- **Authorization**:
- **External services**:
- **Verification**:

## Phase 1: <Title>

**User stories**: <list from PRD>

### Behavior

What narrow user-visible or system-visible behavior this phase proves.

### Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

### Handoff

- Execution loop: `codex-loop` or `claude-loop` if story-based.
- Test-first flow: `tdd` if implementation changes behavior.
```

Keep implementation details out of this architecture plan until the target files and verification path are known. A plan is useful when it preserves stable decisions and gives the execution owner enough boundaries to avoid inventing them.
