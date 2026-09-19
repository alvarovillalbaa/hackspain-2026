# Frontend Documentation Reference

Use this reference when documenting components, hooks, routes, design-system primitives, frontend architecture, or browser-facing behavior.

## What Frontend Docs Need To Capture

Frontend docs should explain behavior contracts, not restate markup.

Document these concerns when they matter:

- ownership: which layer owns data, validation, URL state, client state, and side effects
- states: loading, empty, error, success, disabled, optimistic, and permission-restricted paths
- interaction contract: keyboard flow, focus behavior, shortcuts, drag or drop, and destructive-action safeguards
- accessibility contract: semantic role, labeling expectations, required aria relationships, and screen-reader considerations
- responsive behavior: major breakpoint changes, overflow strategy, and content resilience for long labels or dense data
- integration seams: analytics events, feature flags, i18n, error reporting, and browser-only APIs

## Component Documentation

Document reusable components when they expose a public contract beyond obvious markup.

Good component docs answer:

- what problem the component solves
- when to use it and when not to use it
- which props are required, optional, mutually exclusive, or deprecated
- whether it is controlled, uncontrolled, or supports both
- which refs, slots, or styling seams are intentionally public
- what accessibility guarantees it provides and what consumers must still supply

For low-level primitives, prefer short TSDoc plus one concrete usage example over long prose.

For higher-level domain components, add a nearby README or feature doc when the usage rules are not obvious from the type surface alone.

## Hook, Store, and Data-Flow Documentation

Hooks and stores need docs when they hide state ownership or side effects.

Document:

- inputs and outputs
- side effects and external dependencies
- whether values are derived, cached, or persisted
- failure and retry behavior
- how callers should coordinate with routing, forms, or server data

If a hook exists only to split a large component and is not reused, keep the docs minimal and local.

## Route and Feature Documentation

Add route or feature docs when the behavior spans multiple files or layers.

Capture:

- entrypoints and route boundaries
- server versus client responsibilities
- key user flows and state transitions
- feature flags or permission gates
- analytics and error-reporting events
- proof commands or manual verification paths for high-risk flows

Good route docs help the next engineer answer "where does this behavior live?" in under 2 minutes.

## Design System and Visual Contracts

When documenting primitives, tokens, or shared UI patterns, document the contract rather than the implementation history.

Include:

- available variants and their intended meaning
- token dependencies such as spacing, color, radius, or typography expectations
- composition rules and incompatible combinations
- responsive or density assumptions
- migration guidance when replacing an older pattern

Avoid describing a visual system as a list of CSS classes with no rationale.

## Change Triggers

Update frontend docs when a change alters:

- a public component or hook API
- route behavior or information architecture
- keyboard or focus behavior
- accessibility guarantees
- analytics, feature flags, or error-reporting behavior
- responsive behavior or supported layouts
- migration expectations for consumers

If the change is risky but the repo lacks automated coverage, include brief manual verification notes until tests exist.
