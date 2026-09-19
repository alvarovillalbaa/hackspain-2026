# Dev Loop Configuration

Configuration for an agentic execution loop. Fill in before starting the loop;
the loop reads these values to decide when to continue, stop, or escalate.

## Identity

- **Loop name:** <short slug>
- **Workspace:** <path, e.g. .agentic/dev-loop>
- **Owner:** <human accountable for the result>

## Scope

- **Goal:** <one sentence>
- **In scope:** <bullet list>
- **Out of scope:** <bullet list — be explicit; this prevents drift>

## Stop conditions

The loop halts when ANY of these is true:

- [ ] All acceptance criteria pass
- [ ] Max iterations reached: <n>
- [ ] Same failure repeats <n> times (no progress)
- [ ] A change touches a file outside: <allowed paths/globs>

## Verification commands

Run after every iteration; all must pass before landing:

```bash
<lint command>
<typecheck command>
<test command>
<build command>
```

## Guardrails

- **Never run:** <destructive commands — migrations on prod, force-push, etc.>
- **Requires human approval:** <pushing, opening PRs, deleting files, deps changes>
- **Secrets:** <how the loop accesses them; never commit them>

## Escalation

If blocked, the loop should: <stop and summarize | open a draft PR | message owner>
rather than attempting destructive workarounds.
