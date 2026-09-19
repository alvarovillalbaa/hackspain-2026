# One-Off Documentation Reference

Last updated: 2026-04-25

One-off docs capture a specific decision, investigation, or event. Their value is historical context, not live policy ownership.

## Technical reports

### When to write

Use a report for:

- architecture audits
- performance investigations
- security reviews
- dependency evaluations
- provider comparisons
- post-refactor analysis

### Location

The AFS audit surface. Ask `use-afs` for the path and date format.

### Quality bar

- lead with the summary
- support every finding with evidence
- make recommendations actionable
- link to code and artifacts rather than dumping unnecessary copies

## ADRs

### When to write

Write an ADR when:

- the decision is expensive to reverse
- the decision contradicts a common default
- a future engineer would question the choice without context
- the trade-offs are not obvious from code alone

### Locations

Choose the repo's existing convention:

- inline in the folder's `ARC.md` when the decision is local
- the AFS audit surface, named `adr-[slug].md`, when the decision is cross-cutting or report-like

If the lasting rule becomes operational, also promote it into the relevant living doc.

## Post-mortems

### When to write

Use for:

- production incidents with user impact
- data loss or corruption events
- security incidents
- major deploy failures
- major performance degradation

### Location

The AFS audit surface, named `post-mortem-[incident].md`.

Post-mortems are historical and blameless. If they surface a durable workflow or rule, update the living surface that owns it — a runbook, a knowledge page, or the root instruction doc covering invariants.

## Plans vs specs

- implementation plans belong in the AFS plan surface
- durable desired-state behavior belongs in the AFS spec surface

Do not use the spec surface as a graveyard of historical plan snapshots. Do not leave the plan surface as the only home for a still-current behavior contract.
