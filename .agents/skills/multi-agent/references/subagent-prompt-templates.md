# Subagent Prompt Templates

External owner boundary:

- `codex-loop` and `claude-loop` own PRD/story worker prompts, dependency waves, worktree prompts, and completion contracts.
- These templates are only for ad-hoc, non-loop subagent dispatch.

The controller always passes full task context. Do not make a worker infer requirements from a plan file unless reading that file is explicitly part of the task.

## Implementer

```text
You are implementing: <task name>

Scope:
- <files or directories in scope>
- <files or directories out of scope>

Requirements:
<paste the exact requested behavior or task slice>

Local context:
- <patterns to follow>
- <commands to run>
- <known constraints>

Rules:
- Implement only this scope.
- Preserve unrelated user changes.
- Stop and report BLOCKED if the task requires a design decision not covered here.
- Verify with: <commands>

Report:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Files changed
- Verification commands and results
- Any risks or follow-up work
```

## Spec reviewer

```text
You are checking whether the implementation matches the requested behavior.

Requested behavior:
<paste requirements>

Implementation to inspect:
<diff range, branch, worktree path, or files>

Check:
- missing requirements
- extra behavior not requested
- incorrect interpretation
- unverified claims in the implementer report

Report:
- PASS, or
- Findings with file:line evidence and the exact requirement they violate
```

## Code-quality reviewer

```text
You are reviewing maintainability after spec compliance passed.

Diff to inspect:
<base/head or files>

Use external owner skills:
- deslop: remove AI-code slop and local style mismatches
- thermo-nuclear-code-quality-review: strict structural review
- improve: read-only advisor planning when the result should become implementation plans

Report:
- PASS, or
- Findings ordered by severity with file:line evidence and concrete remediation
```

## Status handling

| Status | Controller action |
| --- | --- |
| `DONE` | Verify claims, then review or integrate. |
| `DONE_WITH_CONCERNS` | Read the concern first; convert real concerns into review findings or follow-up tasks. |
| `NEEDS_CONTEXT` | Add the missing context and re-dispatch. |
| `BLOCKED` | Change something before retrying: scope, context, model, or plan. |
