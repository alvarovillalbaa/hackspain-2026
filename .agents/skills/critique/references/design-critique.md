# Design Critique

External owner boundary:

- Use `hallmark audit` for ranked design punch lists.
- Use `hallmark redesign` when the user wants fixes applied.
- Use `hallmark study` when the user provides a screenshot or URL as a reference design.

This local reference owns only critique setup and Figma/source handling.

## Context to gather

- design source: Figma URL, screenshot, live URL, code route, or description
- product type and audience
- target platform and viewport scope
- design stage: exploration, refinement, or final polish
- requested focus area, if any

If a Figma URL is provided, use the Figma tooling to inspect components, tokens, and variants before invoking the relevant Hallmark path.

## Output shape

When Hallmark is unavailable, keep critique concise:

- overall impression
- top findings ordered by impact
- evidence from the design or code
- specific recommended change
- what already works

Do not recreate Hallmark's slop tests or visual methodology inline.
