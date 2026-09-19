---
name: simplify
description: Reduce duplication, indirection, branching, and unnecessary code in a defined scope while preserving behavior and proving the result.
---

# Simplify

## Use When

- A change works but contains avoidable duplication, wrappers, branches, abstractions, or compatibility residue.
- The user asks to simplify, reduce, consolidate, clean up, or make code easier to understand without changing behavior.
- A focused refactor can improve locality and readability without becoming a broader architecture redesign.

Do not use this skill to redesign product behavior, perform an open-ended repository cleanup, or hide unresolved correctness problems.

## Workflow

1. Confirm the exact scope and read its callers, tests, types, and repository conventions.
2. Establish current behavior with focused tests or another reproducible proof.
3. Identify duplication, unnecessary indirection, dead compatibility paths, over-general abstractions, and control-flow noise.
4. Prefer deletion, direct data flow, standard-library features, and one clear owner.
5. Make the smallest coherent simplification; avoid unrelated formatting or style churn.
6. Re-run focused verification, then broader checks in proportion to risk.
7. Summarize what was removed or consolidated and call out any behavior that was not evaluated.

## Guardrails

- Preserve externally observable behavior unless the user explicitly authorizes a behavior change.
- Do not remove validation, error handling, security checks, accessibility behavior, or observability merely to reduce line count.
- Do not introduce aliases, shims, or facade layers after a canonical owner is established unless a compatibility contract requires them.
- Stop and surface uncertainty when tests are absent and behavior cannot be established safely.

Load `references/simplification-workflow.md` for the detailed checklist and review format.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `agentic-development/tech-debt`
- `frontend`
- `backend`
- `quality-assurance/testing`
- `code-documentation`
- `prs`

## External Skill Chains

- `deslop`: Remove AI-generated code slop from the current diff when naming, comments, weak error handling, or generated noise are the primary problem. Install: `python3 scripts/install-external-skills.py --skill deslop --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
