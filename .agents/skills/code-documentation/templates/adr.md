# Architecture Decision Record Template

File location: the AFS audit surface, named `adr-[kebab-case-title].md`. Ask `use-afs` for the path.
Or inline in the relevant `services/[name]/ARCHITECTURE.md` under an "Decisions" section.

ADR numbering is optional — use it if your team maintains an ADR index.

---

```markdown
# ADR[-NNN]: [Decision title — describe the decision, not the problem]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN
**Deciders:** [Names, team, or "engineering team"]
**Related PRs/Issues:** [Links]

---

## Context

What situation prompted this decision?
- What problem were we solving?
- What constraints existed (technical, business, deadline, team size)?
- What made this choice non-obvious — why couldn't we just follow the standard pattern?

Keep this to 3–6 sentences. This is context, not justification.

---

## Decision

**We decided to [decision statement in one sentence].**

Explain the reasoning:
- Why this option fit the constraints better than the alternatives
- What evidence or experience informed the choice
- What we're willing to trade off, and why that trade-off is acceptable here

---

## Consequences

### Positive
- [Benefit 1 — concrete, not abstract]
- [Benefit 2]

### Negative (accepted trade-offs)
- [Trade-off 1] — mitigated by [how]
- [Trade-off 2] — acceptable because [why]

### Neutral
- [Side effect worth noting — neither good nor bad]

---

## Alternatives Considered

### [Option A Name]
[2–3 sentences: what it is, why it was considered, why it was rejected]

### [Option B Name]
[2–3 sentences: what it is, why it was considered, why it was rejected]

---

## References

- [Link to relevant PR, benchmark, RFC, or external article]
- [Link to related ADR if supersedes or is superseded]
```

---

## Examples of Good and Bad ADR Titles

### Good titles (describe the decision)
- "Use ObjectItem pattern for polymorphic contract/office relations instead of dedicated FK models"
- "Store MCP tool results in Redis with 1-hour TTL instead of persisting to PostgreSQL"
- "Use Celery chain over direct WebSocket for streaming agent responses"
- "Adopt RetrievalLevelMixin as standard serializer pattern instead of per-view serializer subclasses"

### Bad titles (describe the problem or are too vague)
- "Database decision" — too vague
- "Why we chose PostgreSQL" — obvious, doesn't capture the specific sub-decision
- "Serializer refactor" — describes the work, not the decision
- "Performance" — meaningless without specifics

---

## When to Write an ADR (Decision Checklist)

Write an ADR when you answer "yes" to any of these:

- [ ] Would a reasonable engineer question this decision in 6 months?
- [ ] Is the decision expensive or slow to reverse?
- [ ] Does the decision contradict a common pattern or industry default?
- [ ] Were there multiple viable options with real trade-offs?
- [ ] Did the decision require significant discussion or disagreement?
- [ ] Does the code that results look "wrong" without the context behind it?

If you answered "no" to all of the above, a comment in the code or a note in the PR description is sufficient.

---

## ADR Lifecycle

```
Proposed → (team review) → Accepted → (if superseded) → Deprecated
                                                        → Superseded by ADR-NNN
```

When a decision is reversed:
1. Update the original ADR status to "Superseded by ADR-NNN"
2. Write a new ADR explaining the new decision and what changed
3. Link both ADRs to each other
