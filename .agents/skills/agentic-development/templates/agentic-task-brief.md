# Agentic Task Brief: <task title>

A self-contained brief an agent can execute without further context. If a fresh
agent cannot start from this document alone, it is not yet complete.

## Objective

<One or two sentences. What outcome is required and why it matters.>

## Context

- **Repo / service:** <name>
- **Entry points:** <files, modules, or endpoints to start from>
- **Relevant prior work:** <PRs, commits, docs — links>
- **Constraints:** <perf, compatibility, deadlines, style rules>

## Acceptance criteria

Observable and testable. The agent self-checks against these before finishing.

- [ ] <criterion>
- [ ] <criterion>
- [ ] Existing tests and checks still pass

## Plan of attack

1. <step>
2. <step>
3. <step>

## Verification

```bash
<commands the agent must run to prove the work — tests, lint, build, manual check>
```

## Out of scope

- <explicitly excluded so the agent does not expand the task>

## Done means

<Definition of done in one sentence: e.g. "criteria pass, suite green, single
focused commit, summary of changes returned.">
