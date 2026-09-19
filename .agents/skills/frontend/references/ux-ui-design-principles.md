# UX/UI Design Principles

Comprehensive reference for building high-quality, production-grade web interfaces.

## Visual design

- Establish clear visual hierarchy to guide attention.
- Choose a cohesive color palette; maintain WCAG 2.1 AA contrast ratios.
- Use typography with intentionality: distinctive display fonts paired with refined body fonts. Avoid generic choices (Inter, Roboto, Arial). Prefer `font-variant-numeric: tabular-nums` for comparisons.
- Design with consistent style across the application.
- Layered shadows mimic ambient + direct light. Semi-transparent borders improve edge clarity.
- Nested border radii: child radius ≤ parent radius so curves are concentric.

## Interaction design

- Create intuitive navigation; use familiar UI components to reduce cognitive load.
- Provide clear calls-to-action.
- Responsive design across device sizes.
- Animations must be purposeful: use them to clarify cause/effect or add deliberate delight. Never animate "just because." Honor `prefers-reduced-motion`.
- Prefer CSS animations > Web Animations API > JS libraries. Use `transform` and `opacity` for compositor-friendly animations. Never use `transition: all`.
- Touch targets ≥ 44px on mobile. Set `touch-action: manipulation` to prevent double-tap zoom.
- Interruptible animations: user input should cancel in-progress animations.

## Accessibility

- Follow WCAG 2.1 AA minimum; prefer APCA for perceptual contrast accuracy.
- Semantic HTML before `aria-*` attributes.
- Keyboard accessibility for all flows; WAI-ARIA authoring patterns for focus traps.
- Visible focus rings using `:focus-visible`.
- Icon buttons need descriptive `aria-label`. Decorative elements get `aria-hidden`.
- `<input>` font size ≥ 16px on mobile to prevent iOS Safari auto-zoom.
- Status cues must not rely on color alone; include text labels.
- Set `<meta name="theme-color">` to match page background.

## Layout and composition

- Optical alignment: adjust ±1px when perception beats geometry.
- Every element aligns intentionally: to grid, baseline, edge, or optical center.
- Responsive: verify on mobile, laptop, and ultra-wide (zoom 50% for ultra-wide).
- Account for notches and insets with safe-area variables.
- Prefer flex/grid/intrinsic layout over measuring in JS.
- Set `overscroll-behavior: contain` in modals/drawers.

## Forms and inputs

- Every control has a `<label>` or `aria-labelledby`.
- Enter submits text inputs; `⌘/⌃+Enter` submits textareas.
- Keep submit enabled until submission starts; disable during request.
- Show validation errors next to fields; focus first error on submit.
- Set `autocomplete` and `inputmode` for better mobile keyboards.
- Disable `spellcheck` for emails, codes, usernames.
- Never disable paste in `<input>` or `<textarea>`.
- Trim input values before validation to avoid confusing errors.

## Performance

- Preload only above-the-fold images; lazy-load the rest.
- Set explicit image dimensions to reserve space and avoid CLS.
- Use `<link rel="preconnect">` for asset/CDN domains.
- Preload critical fonts to avoid flash and layout shift.
- Subset fonts to only the code points/scripts in use.
- Move long tasks to Web Workers.
- Virtualize large lists with `content-visibility: auto` or a virtual list library.
- POST/PATCH/DELETE should complete in <500ms.

## Content and copy

- Active voice: "Install the CLI" not "The CLI will be installed."
- Title Case for headings and buttons. Sentence case for marketing pages.
- Avoid jargon; be specific: "Save API Key" not "Continue."
- Positive, problem-solving framing for errors: tell the user how to fix it.
- Use `&nbsp;` for units and keyboard shortcuts: `10&nbsp;MB`, `⌘&nbsp;+&nbsp;K`.
- Curly quotes (" ") over straight quotes (" ").
- Ellipsis character (…) not three periods (...).
- Format dates, times, numbers, and currencies for the user's locale.

## States and content resilience

- Design all states: empty, sparse, dense, error, loading.
- Stable skeletons: mirror final content layout exactly to prevent layout shift.
- Page titles reflect current context.
- No dead ends: every screen has a next step or recovery path.
- Handle short, average, and very long content in every component.

## URL and state

- Persist shareable state in URL (filters, tabs, pagination, expanded panels).
- Back/Forward navigation restores prior scroll position.
- Warn before navigation when unsaved changes exist.
- Optimistic updates: update UI immediately when success is likely; reconcile on server response.

## Copywriting defaults

- Numerals for counts: "8 deployments" not "eight deployments."
- Currency: 0 or 2 decimal places in a given context, never mixed.
- Space between number and unit: `10 MB` (use `&nbsp;`).
- Consistent placeholder format: strings as `YOUR_API_TOKEN_HERE`, numbers as `0123456789`.
