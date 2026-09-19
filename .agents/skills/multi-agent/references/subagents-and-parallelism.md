# Subagents and Parallelism

External owner boundary:

- Use `codex-loop` for Codex PRD/story execution with one fresh Codex subagent per story.
- Use `claude-loop` for Claude PRD/story execution with one fresh Task subagent per story.
- Do not duplicate their `prd.json`, progress-file, dependency-wave, worktree, archive, or completion-signal protocols here.

This reference is only for ad-hoc, non-PRD subagent coordination inside this plugin.

## Input triage

Before dispatching subagents, classify the work.

| Input | Local action |
| --- | --- |
| Existing `codex-loop/prd.json` or `claude-loop/prd.json` | Invoke the matching external loop skill. |
| Plan/spec file with task units | Read the file, identify independent units, then use this local reference for dispatch. |
| Bare prompt | Inspect likely files and tests first; dispatch only after the units are concrete. |

Default to inline work when the scope is small. Use subagents only when a smaller context window or independent role materially improves the result.

## Execution strategy

| Strategy | Use when |
| --- | --- |
| Inline | One or two local edits, unclear requirements, or likely user interaction. |
| Serial subagents | Three or more dependent units, or units that touch the same files. |
| Parallel subagents | Independent units with clear file ownership and a harness that can isolate writes. |

If the request becomes a story backlog or autonomous implementation loop, stop using this local strategy and chain to `codex-loop` or `claude-loop`.

## Parallel safety

Run this check before parallel dispatch:

1. Map every unit to expected create/modify/test paths.
2. Identify overlapping files and shared generated artifacts.
3. If isolation is unavailable, downgrade overlaps to serial execution.
4. If isolation is available, record the expected overlap and merge order before dispatch.

Never let parallel workers share responsibility for staging, committing, or final verification. The controller owns integration.

## Controller duties

Before dispatch:

- provide the exact scope, relevant files, acceptance criteria, and verification commands
- include constraints such as "do not touch unrelated files"
- define the expected result format
- keep secrets and destructive actions out of worker prompts unless explicitly approved

After dispatch:

- read the diff or artifacts yourself
- verify worker claims independently
- integrate in a deterministic order
- run the proof chain that covers the combined result

## Review split

When quality matters more than speed, split implementation from review:

- Builder brief: task slice, local patterns, files, and verification commands.
- Spec reviewer brief: requested behavior, rejection criteria, and finding format.
- Code-quality reviewer brief: diff range, maintainability criteria, and severity scale.

For code-quality review methodology, chain to `deslop` and `thermo-nuclear-code-quality-review` instead of restating their rules here.

## Stop conditions

Stop and rescope when:

- a worker reports `BLOCKED` and the controller cannot resolve it from source files
- two workers changed the same file in incompatible ways
- integrated verification fails after individually passing units
- the prompt to a worker would be "figure it out"
- the task has become a PRD/story loop better owned by `codex-loop` or `claude-loop`

## Related local references

- [subagent-prompt-templates.md](subagent-prompt-templates.md) contains minimal handoff shapes for non-loop dispatch.
- [model-routing.md](model-routing.md) covers local model-tier choices.
- [orchestrate-roles.md](orchestrate-roles.md) covers role selection for ad-hoc teams.
