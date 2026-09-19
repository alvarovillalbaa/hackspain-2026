# Accessibility Patterns Reference

Practical patterns for auditing and implementing accessible frontends. Scope: WCAG 2.2 AA as the default bar, semantic HTML, keyboard behavior, and screen-reader support. Local repo rules and product constraints win over this reference when they conflict.

## WCAG at a glance (POUR)

| Principle | Means | Common failures |
| --- | --- | --- |
| **Perceivable** | Content is presentable to all senses | Missing alt text, low contrast, no captions |
| **Operable** | UI works by any input method | Keyboard traps, no focus indicator, time limits |
| **Understandable** | Content & operation are predictable | Unlabeled inputs, inconsistent nav, unclear errors |
| **Robust** | Works across assistive tech | Invalid HTML, custom widgets without ARIA roles |

Target **WCAG 2.2 Level AA** unless the project specifies otherwise. AAA is selective, not a blanket goal.

### Key AA success criteria to check
- **1.1.1** Non-text content has text alternatives.
- **1.3.1** Info and relationships conveyed through structure (headings, lists, labels), not visuals alone.
- **1.4.3** Contrast: 4.5:1 for normal text, 3:1 for large text (≥24px, or ≥18.66px bold) and UI components/graphics.
- **1.4.11** Non-text contrast 3:1 for controls and meaningful graphics.
- **2.1.1 / 2.1.2** All functionality keyboard-operable; no keyboard traps.
- **2.4.3** Focus order is logical and matches reading order.
- **2.4.7** Focus is visible.
- **2.4.11 (2.2)** Focused element is not entirely hidden by other content (sticky headers, etc.).
- **2.5.8 (2.2)** Target size at least 24×24 CSS px (or adequate spacing).
- **3.3.1 / 3.3.2** Errors identified in text; inputs have labels/instructions.
- **4.1.2** Name, role, value exposed for all UI components.

## Semantic HTML first

Reach for the native element before building a custom widget. Native elements bring focus, keyboard behavior, and roles for free.

| Use | Not |
| --- | --- |
| `<button>` | `<div onclick>` |
| `<a href>` for navigation | `<span>` with a click handler |
| `<input>` / `<select>` / `<textarea>` | custom div fields without roles |
| `<nav> <main> <header> <footer> <aside>` | generic `<div>` soup |
| `<ul>/<ol>/<li>` for lists | stacked `<div>`s |
| `<table>` with `<th scope>` for data | CSS grid faking a table |
| `<dialog>` or a focus-managed modal | absolutely-positioned div |

### Headings & landmarks
- One `<h1>` per page (the page's topic). Don't skip levels (h2 → h4).
- Use headings for structure, not for font size — style with CSS.
- Provide landmarks: one `<main>`, labeled `<nav aria-label="...">` when multiple navs exist.
- Add a "Skip to content" link as the first focusable element.

## Keyboard navigation

Every interactive element must be reachable and operable with keyboard alone.

| Widget | Expected keys |
| --- | --- |
| Button | `Enter` and `Space` activate |
| Link | `Enter` activates |
| Checkbox | `Space` toggles |
| Radio group | `Arrow` keys move and select within group; group is one tab stop |
| Select / listbox | `Arrow` to move, `Enter`/`Space` to choose, `Esc` to close |
| Tabs | `Arrow` keys switch tabs; `Tab` moves to panel |
| Menu / menubar | `Arrow` keys navigate, `Esc` closes, `Enter` activates |
| Modal dialog | Focus trapped inside; `Esc` closes; focus returns to trigger |
| Combobox | `Arrow`/typeahead, `Esc` closes, announces results |

Rules:
- Use `tabindex="0"` to add custom controls to tab order; `tabindex="-1"` for programmatic focus only. **Never** use positive tabindex.
- Manage focus on route changes, modal open/close, and dynamic content insertion — move focus to the new context.
- Never remove focus outlines without an equally visible replacement (`:focus-visible`).
- Avoid keyboard traps: the user must be able to tab away from every component.

## Screen-reader support

### Accessible names
Every control needs a name. Order of preference:
1. Visible `<label for>` (form fields) or element text content (buttons/links).
2. `aria-labelledby` referencing visible text.
3. `aria-label` when no visible text exists (icon-only buttons).

Icon-only button pattern:
```html
<button aria-label="Close dialog">
  <svg aria-hidden="true" focusable="false">…</svg>
</button>
```

### Images
- Informative image: `alt` describing the meaning, not the pixels.
- Decorative image: `alt=""` (empty, not missing) so it's skipped.
- Complex image (chart): short `alt` + longer description nearby or via `aria-describedby`.

### Live regions
Announce async updates without moving focus:
- `aria-live="polite"` for non-urgent (search results loaded, saved).
- `aria-live="assertive"` (or `role="alert"`) for urgent (errors, session timeout).
- The container must exist in the DOM before content changes; inject text into it.

### ARIA discipline
- **First rule of ARIA: don't use ARIA if a native element works.**
- ARIA changes semantics, not behavior — you still wire up the keyboard.
- Don't set a role that contradicts the element (`<button role="link">`).
- Keep `aria-expanded`, `aria-selected`, `aria-checked`, `aria-current` in sync with state.
- `aria-hidden="true"` hides from AT — never put focusable content inside it.

## Forms

- Associate every input with a `<label>` (visible preferred).
- Group related fields with `<fieldset>` + `<legend>` (radios, address blocks).
- Mark required fields in text, not color alone; use `aria-required` / `required`.
- On error: set `aria-invalid="true"`, link the message via `aria-describedby`, summarize errors at the top, and move focus to the summary or first error.
- Don't rely on placeholder as the only label (it disappears and has poor contrast).

## Color & motion

- Never use color as the only signal — pair with text, icon, or pattern.
- Meet contrast ratios (see 1.4.3 / 1.4.11). Verify computed colors, including on hover/disabled states.
- Respect `prefers-reduced-motion`: disable or reduce non-essential animation, parallax, and auto-play.
- Don't auto-play media with sound; provide controls.

## Audit workflow

1. **Automated pass** (axe-core / Lighthouse / pa11y) — catches ~30–40% of issues (contrast, missing alt/labels, invalid ARIA). Necessary, not sufficient.
2. **Keyboard-only pass** — unplug the mouse: tab through, operate everything, watch focus visibility and order, test `Esc`/arrow behavior in widgets.
3. **Screen-reader pass** — VoiceOver (Safari/macOS), NVDA (Firefox/Windows). Verify names, roles, states, and live announcements.
4. **Zoom/reflow** — 200% zoom and 320px width with no loss of content or horizontal scroll (1.4.10).
5. **Reduced-motion / forced-colors** — verify the UI survives both.

## Report format for findings

For each issue: **Location** (component/selector) · **WCAG criterion** · **Severity** (blocker/serious/moderate/minor) · **What a user experiences** · **Concrete fix**. Prefer the smallest semantic fix (native element, label) over ARIA workarounds.
