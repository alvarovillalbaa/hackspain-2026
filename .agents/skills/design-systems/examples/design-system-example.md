# Example: Adding a New Button Variant to a Design System

Request: add a `destructive` Button variant for delete/remove actions across the app.

## 1. Check what exists first

Existing Button supports `variant: primary | secondary | ghost` and `size: sm | md | lg`, backed by semantic color tokens (`--color-action-*`). There is no destructive treatment, so designers have been hardcoding red — three different reds found in the codebase. This is exactly the drift a design system should remove.

## 2. Define the token, not just the color

Add semantic tokens that map to existing primitives (don't introduce a new red):

```
--color-action-danger        = {red.600}
--color-action-danger-hover  = {red.700}
--color-action-danger-fg     = {white}
```

## 3. Variant spec

| Prop value | Background | Text | Hover | Disabled |
| --- | --- | --- | --- | --- |
| `destructive` | action-danger | action-danger-fg | action-danger-hover | 40% opacity |

States: default, hover, active, focus-visible (2px focus ring, token `--ring`), disabled, loading (spinner inherits fg).

## 4. Usage rules (document these, or it gets misused)

- Use `destructive` only for irreversible or data-losing actions.
- Never two destructive buttons in one view.
- Pair with a confirmation or undo affordance.

## 5. Accessibility

- Contrast: danger-fg on action-danger ≥ 4.5:1 (verify with token values).
- Don't rely on color alone — keep a clear text label ("Delete", not just an icon).

## 6. Rollout

1. Add tokens + variant to the library with stories for every state.
2. Codemod/replace the three hardcoded reds with `<Button variant="destructive">`.
3. Add a lint rule flagging raw red hex in button contexts.

## Outcome

One canonical destructive treatment, theming-safe (works in dark mode via tokens), and migration path for existing misuse.
