# Component Spec: <ComponentName>

> Owner: <name> · Status: proposed / in-build / shipped · Version: <x.y>

## Purpose

What this component is for and the one job it does. When NOT to use it (point to the alternative).

## Anatomy

Parts that make up the component (container, label, icon slot, etc.).

## Props / API

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| variant | | | |
| size | | | |
| disabled | boolean | false | |

## Tokens used

List the semantic tokens this component binds to (color, spacing, radius, typography). No raw values — everything maps to a token.

| Slot | Token |
| --- | --- |
| background | |
| text | |
| border/radius | |

## States

default · hover · active · focus-visible · disabled · loading · error. Describe each.

## Variants

| Variant | When to use | Visual difference |
| --- | --- | --- |

## Accessibility

- Roles / ARIA:
- Keyboard interaction:
- Contrast targets (≥ 4.5:1 text):
- Focus handling:

## Usage rules

Do / don't. Composition constraints (e.g., max one per view).

## Implementation notes

Stories required per state, test coverage, migration path if replacing existing patterns.
