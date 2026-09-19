# Runbook Template

Copy this into `runbooks/<workflow>.md` for repo-wide processes, or `RUNBOOK.md` inside a folder when the procedure is local to that subsystem.

Replace all placeholder text. Keep commands executable and verification steps explicit. Mark dangerous steps before the operator reaches them, and record who owns the workflow plus when it was last verified.

---

```markdown
# [Workflow Name]

Last updated: YYYY-MM-DD

## Purpose

[One paragraph describing what this workflow accomplishes and when to use it.]

## When to Use

- [Signals, symptoms, or requests that mean this workflow is the right one]

## Do Not Use When

- [Cases that should route to a different runbook, script, or owner]

## Owner / Last Verified

- Owner: [team or person]
- Last verified: [YYYY-MM-DD]

## Preconditions

- [Required access, environment, branch state, services, secrets, or approvals]
- [Anything that must already exist before starting]

## Safety Notes

- [Irreversible or high-risk action to notice before starting]
- [What must be backed up, paused, or confirmed first]

## Inputs

- [Files, URLs, tickets, environment variables, IDs, or commands needed]

## Procedure

1. [Exact step]
2. [Exact step]
3. [Exact step]

## Verification / Health Checks

- [Command or check that proves success]
- [Check to run before risky steps, if applicable]
- [Expected output, observable state, or downstream confirmation]

## Rollback / Recovery

- [How to undo the change if a step fails]
- [How to return the system to a safe state]

## Escalation

- [Who or what to involve if this workflow fails]
- [Links to dashboards, alerts, tickets, or owners]

## Related Docs

- [AGENTS.md](../AGENTS.md)
- [TASTE.md](../TASTE.md)
- [Relevant README, ARCHITECTURE, TESTS, or SPEC file](#)
```

When the workflow is operationally important, rehearse it outside incident conditions and update both `Last updated` and `Last verified` after a successful run.
