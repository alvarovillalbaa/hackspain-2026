# Embat chrome — pre-ship polish pass v2 (post PR #34)

Model: `helm/deepseek-v4-flash`. Scope: `web/components/embat/*.tsx` + `web/components/embat/font.ts`
(unchanged) and allowed token values inside the `.embat-ui` block of `web/app/globals.css`.
Not touched: `web/app/layout.tsx` (injected by another worker), `web/lib`, `web/hooks`,
`web/app` routes, `components/xray/*`, `components/ui/*`. No commit.

## Root cause found (why the theme looked off)

The chrome components were refactored in PR #34 to read the shadcn tokens instead of
hardcoding the Embat palette. Commit `dd9729b` ("Monta el cockpit…", 20 sep 00:29) then
overwrote those tokens in `.embat-ui`:

| token | intended (pre-regression, docs, brief) | committed regression |
|---|---|---|
| `--primary` / `--accent` / `--ring` | `#11a8ff` | `#146c43` (green) |
| `--radius` | `0.25rem` (4 px) | `1rem` (16 px → `rounded-xl` 22 px, `rounded-2xl` 29 px) |

That single commit made primary buttons, active nav and filters green and every card/chip
roughly 5× too round, contradicting `docs/frontend_v0.md` ("radio 4px, `#11a8ff`"),
`docs/impeccable/critique_ficha.md` and this brief. Restoring the three tokens fixed the
whole chrome at the narrowest correct level instead of rewriting 76 `rounded-*` call sites.
`--radius: 0.25rem` makes `rounded-lg`=4 px, `rounded-xl`=5.6 px, `rounded-2xl`=7.2 px —
all inside the ≤8 px cap of priority (e).

## Files modified (17)

`web/app/globals.css` (`.embat-ui` tokens only) and all 16 touched embat components:
`chrome.tsx`, `ficha.tsx`, `compania.tsx` (no change), `companias.tsx`,
`grupo.tsx`, `grupo-empresarial.tsx`, `dashboard.tsx`, `ofertas.tsx`, `offer-ui.tsx`,
`contratar-prestamo.tsx`, `treasury-chart.tsx`, `signals-dialog.tsx`,
`peers-benchmark.tsx`, `productos-book.tsx`, `acciones-portfolio.tsx`, `watchers.tsx`,
`anticipacion.tsx`. `font.ts` left as is.

## Changelog per priority

**(a) Contrast.** Replaced every `#999` (≈2.8:1 on white) with `#6b6b6b` (≈5.3:1, AA) across
38 occurrences — table headers (`grupo-empresarial`), card headings and sub-labels (`ficha`
18×), member ids (`grupo`), chart axis ticks and dashed reference strokes (`treasury-chart`,
`peers-benchmark`, now also ≥3:1 non-text contrast), signal blurbs/polarity (`signals-dialog`),
anticipación labels/footnote, and `data-placeholder` in `embatSelectTriggerClass`. Placeholders
in primitives resolve to `--muted-foreground` `#666` (5.7:1). Two standalone error lines in
brand red on white (`grupo.tsx`, `grupo-empresarial.tsx`) moved from `#e61847` (4.25:1, fail)
to the existing `text-destructive` (≈4.8:1, AA). Documented exception (same as the pre-PR34
pass): brand status/primary colours used as text on their tinted chips (`#00a14e`, `#e61847`,
`#11a8ff`, `#ef8000`) are kept; each such chip carries its word, and `text-primary` links are
kept as the pinned brand colour.

**(b) Legible without colour.** `FichaGauge` received the band and now renders a caption
`Banda <letra> · <Positivo|Estable|Negativo>` under the gauge, so band + outlook read without
the arc colour (the pre-PR34 decision, re-derived). Audited every other colour-only cue:
`statusClass` chips and `outlookMeta` labels are worded; `signedBadgeClass` badges carry the
`+`/`−` sign; the `ConfidenceMeter` dots are a count plus the word; dashboard "Outlook cartera"
uses `↑ / → / ↓`; `SignalsDialog` red rows say "cola roja"; the watcher badge says
"Crítica/Aviso"; score badges in tables sit next to the worded Estado column.

**(c) Keyboard.** Added shared `embatFocusRing` (2 px `#11a8ff`, offset 2, `outline-solid`,
`ring-0` to replace the primitive 3 px ring) and `embatRowFocusRing` (inset `-2px`) in
`chrome.tsx`. Applied to `FilterChip`, `FilterField` input + submit, `embatSelectTriggerClass`,
`embatSelectItemClass` (white, visible on the blue fill), `ConfidenceMeter` and `RationaleTip`
triggers, "Ver señales", trajectory-range buttons, action rows, `companias` group link and rows,
grupo/group list links, `grupo-empresarial` filter buttons, name link and focusable `<tr>`,
dashboard/peers list links, and the four `Item render={<Link>}` list rows (ofertas, book,
portfolio, watchers). `companias` rows are clickable but were not keyboard-reachable; added
`tabIndex={0}` + Enter/Space handler (guarded by `target === currentTarget`) mirroring the
existing `<tr>` pattern. Search inputs use a `focus-within` ring on their wrapping label. The
contratar dialog buttons switched from an invisible `outline-white` on white to the shared blue
ring. No `outline-none` is left without a `focus-visible` replacement.

**(d) Overflow / alignment.** `tabular-nums` added to sub-score, driver-delta, action amount,
group header/rows and anticipación tiles (charts, dashboard, compañías and book already had it).
`min-w-0 break-words` on `FichaTitle`; `truncate tabular-nums` on action amounts;
`title` on truncated member/company names and dashboard KPI values; `flex-wrap` on the
`grupo-empresarial` header and its title block and on the anticipación header so the search
field / chip drop below at `max-lg:` widths instead of overflowing.

**(e) Consistency.** Removed the only gradient text (`FeeBadge` in `offer-ui.tsx`) → solid
`#6d28d9` on the existing purple tint (≈7:1). Removed glassmorphism: `companias` compare bar
`bg-white/95 backdrop-blur-md` → solid `bg-white`, and the contratar dialog overlay's
`backdrop-blur-[4px]` dropped. `DemoChip` no longer inherits `rounded-4xl` (10.4 px > cap) →
`rounded-xl` like every other embat chip. All radii now derive from the 4 px base.

**(f) Motion.** Hover/focus transitions are colour-only (`transition-colors duration-150
ease-out`), each paired with `motion-reduce:transition-none`, on the elements we own
(buttons, chips, option items, rows, links). The contratar progress bar keeps its functional
`transition-[width]` but is now reduced-motion-guarded; the spinner gained
`motion-reduce:animate-none`. The dialog scale animation stays inside the
`prefers-reduced-motion` block in `globals.css` (untouched).

## Verification (from `web/`)

- `npm run typecheck` → clean.
- `npm test` → **43 files / 201 tests passed**.
- `npx eslint components/embat` → 2 errors + 2 warnings, all pre-existing on lines this pass
  never edits: `contratar-prestamo.tsx:74` (`react-hooks/refs`) and `:86`
  (`react-hooks/set-state-in-effect`) — hook logic is explicitly out of scope — plus the
  `ficha.tsx` `<img>` warning and the `grupo.tsx:61` unused `groupId` warning.
- `npm run lint` repo-wide → 8898 problems (95 errors / 8803 warnings); every error is outside
  the files changed here (pre-PR34 baseline + generated `.eve` bundle). This pass adds none.
- Dev server on `http://localhost:3000` answers 200 and the app shell renders under `.embat-ui`,
  so the restored tokens apply as intended.

## Intentional exceptions

- Pinned brand colours as text on tinted chips (`#00a14e`, `#e61847`, `#11a8ff`, `#ef8000`) and
  `text-primary` links stay as the brand; each worded chip carries its label. Recolouring them
  would contradict the brief's "primary `#11a8ff`".
- White text on `#11a8ff` primary buttons is ≈2.6:1; this predates the pass and is inherent to
  the pinned brand primary, so it is left as is.
- The contratar progress bar and spinner keep motion because they communicate real progress,
  guarded by `prefers-reduced-motion`.
