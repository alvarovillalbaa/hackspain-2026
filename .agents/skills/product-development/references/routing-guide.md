# Product Development — Routing Guide

Router for product development work. Routes to the appropriate product skill.

## Child Skills

| Child | Owns |
|-------|------|
| `discovery` | User research, interviews, insight synthesis |
| `prds` | Product requirement documents |
| `experiments` | Feature experiments and A/B tests |
| `user-stories` | User story writing and story mapping |
| `strategy` | Product strategy, vision, OKRs |
| `direction` | Product direction memos and focus decisions |
| `design` | Product design (UX, UI, design system) |

## Routing Decision Tree

```
Is this about understanding what to build and why?
  → discovery (user research)
  → strategy (market and competitive context)
  → direction (internal product direction decisions)

Is this about specifying what to build?
  → prds (formal requirement document)
  → user-stories (agile story format)

Is this about validating an idea before building?
  → experiments (A/B test or feature flag experiment)

Is this about designing how to build it?
  → design
```

## Product Development Principles

- **Problem before solution**: Define the problem with evidence before specifying solutions.
- **Smallest slice**: Ship the smallest version that validates the core hypothesis.
- **Metrics first**: Define success metrics before writing the PRD.
- **Customer evidence**: Every major product decision should reference at least 3 customer data points.
- **Time-boxed discovery**: Discovery phases have a fixed end date — avoid indefinite research loops.
