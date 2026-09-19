# Decision explanation

## Outcome

Keep the existing public skill slug and upgrade it in place.

## Mode details

### Question

Should the eval capability keep ai-evals or add a new evals alias?

### Criteria

- Preserve one canonical owner
- Avoid overlapping triggers and unnecessary migration

## Actions

- Inspected the department profile and current skill directory.
- Compared the requested capability with the existing public owner.

## Evidence

- **Verified:** The Engineering profile already lists ai-evals. — Source: engineering/profile.yaml
- **Verified:** The existing ai-evals directory is the canonical entrypoint. — Source: engineering/skills/ai-evals/SKILL.md

## Reasoning summary

Preserving the canonical slug avoids overlapping triggers and migration work while still allowing the capability to be upgraded. The profile and existing entrypoint are direct evidence of ownership.

## Assumptions

- Existing users may depend on the current slug.

## Alternatives

- Add evals as an alias, which would create overlapping triggers and maintenance.

## Uncertainty

- No external install telemetry was available to quantify alias usage.

## Current state

The ownership decision is settled; implementation can proceed under ai-evals.

## Known gaps

- External install telemetry was not evaluated.

## Next action

Upgrade ai-evals and document its boundary with observability.
