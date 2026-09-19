# Example: Design Brief for a New User Dashboard

> Product: Acme Analytics · Surface: post-login home dashboard · Owner: design lead

## Problem

New users land on a generic empty dashboard and don't know what to do first. Activation (first saved report within 7 days) sits at 31%. The dashboard must guide a first-time user to value and orient a returning user fast.

## Users & jobs

- **First-run user:** "Show me this tool can answer my question." Job: reach a first insight in < 5 minutes.
- **Returning daily user:** "Get me to the thing I check every morning." Job: resume in < 10 seconds.

## Success criteria

- 7-day activation 31% → 45%.
- Returning users reach a saved view in ≤ 2 clicks.
- No regression in time-to-first-report for power users.

## Constraints

- Must reuse the existing component library and grid; no new color tokens.
- Works at 1280px and 768px; data widgets must degrade gracefully when empty.
- Ships behind a flag; staged rollout.

## Scope

In: empty state, first-run checklist, widget grid, saved-views shortcut.
Out (v2): customizable widget layout, sharing, mobile-native.

## Content & states to design

Loading, empty (no data yet), partial (1-2 widgets), populated, error.

## Open questions

- Should the first-run checklist be dismissible permanently or reappear until activation?
- Do we personalize the default widgets by signup role?

## Deliverables

Lo-fi flow → hi-fi for the 5 states → prototype for usability test with 5 new users.
