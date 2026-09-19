# Design — Routing Guide

Router for product design work. Routes to design specialist skills.

## Child Skills

| Child | Owns |
|-------|------|
| `design-systems` | Component libraries, design tokens, Figma systems |
| `discovery` | User research, interviews, JTBD synthesis |
| `critique` | Design critique and feedback sessions |
| `polish` | UI polish passes — typography, spacing, copy |
| `taste` | Taste evaluation — aesthetic quality assessment |

## Routing Decision Tree

```
Is this about building or maintaining a design system or component library?
  → design-systems

Is this about understanding user needs before designing?
  → discovery

Is this about evaluating and improving an existing design?
  → critique (for structured critique)
  → polish (for quick pass on spacing/typography/copy)
  → taste (for aesthetic/subjective quality check)

Is this about designing a new feature or screen from scratch?
  → handle directly: brief → wireframe → review with critique
```

## Design Principles

- **Solve the problem, not the symptom**: Understand the underlying user need before designing solutions.
- **Progressive disclosure**: Show only what users need at each step.
- **Consistency over cleverness**: Use existing patterns before inventing new ones.
- **Accessibility by default**: Every design must pass WCAG 2.1 AA.
- **Mobile-first**: Design for mobile constraints first, then scale up.

## Design Review Gates

Before a design ships:
1. [ ] Does it solve the stated user problem?
2. [ ] Does it follow the design system?
3. [ ] Has it been reviewed by at least one non-designer?
4. [ ] Does it pass basic accessibility checks?
5. [ ] Is the copy final and reviewed?
