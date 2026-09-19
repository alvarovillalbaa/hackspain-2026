# Review — Routing Guide

Router for all review and quality check work. Routes to the appropriate review skill.

## Child Skills

| Child | Owns |
|-------|------|
| `code-review` | Code diff review, PR review |
| `design-review` | UX/UI design review |
| `content-audit` | Content quality audit |
| `grill` | Socratic review of ideas, decisions, plans |

## Routing Decision Tree

```
Is this reviewing a code diff or PR?
  → code-review

Is this reviewing a design (mockup, prototype, live UI)?
  → design-review

Is this auditing existing content (blog posts, docs, marketing)?
  → content-audit

Is this stress-testing an idea, argument, or strategic decision?
  → grill
```

## Review Quality Standards

- **Scope before reviewing**: Understand what's being reviewed and what "good" looks like before starting.
- **Evidence over opinion**: Ground feedback in principles, data, or user evidence — not personal preference.
- **Prioritize findings**: Label feedback as blocker / major / minor / suggestion.
- **Constructive framing**: Every critique should include a suggestion for improvement.
- **One review pass**: Multiple rounds without acceptance criteria create review loops — define done upfront.
