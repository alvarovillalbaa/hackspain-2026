# Embat chrome — pre-ship polish pass

Model: helm/deepseek-v4-flash. Scope: `web/components/embat/*` only.

## Files modified (6)

- `web/components/embat/chrome.tsx`
- `web/components/embat/ficha.tsx`
- `web/components/embat/companias.tsx`
- `web/components/embat/grupo-empresarial.tsx`
- `web/components/embat/grupo.tsx`
- `web/components/embat/anticipacion.tsx`

Unchanged: `compania.tsx`, `font.ts`, and `web/app/globals.css` (no token change needed).

## Changelog per priority

**(a) Contrast.** Every `#999` (≈2.8:1 on white) became `#6b6b6b` (≈5.3:1, AA) — text labels,
table headers, card headings, subtitles, footnotes, and `placeholder:`/`data-placeholder:`
in `FilterField` and `embatSelectTriggerClass`. `#666` (≈5.7:1) body text left as is.
Documented exception (deliberate, pinned theme): status/primary text colors `#00a14e`,
`#e61847`, `#11a8ff` are below 4.5:1 as text on their tinted chips. They are the pinned
brand palette and each chip now always carries its word, so they were not recolored.

**(b) Legible without color.** `FichaGauge` accepted `band` but rendered it nowhere — the
gauge number was color-only. Added a caption under the gauge: `Banda <letra> · <Positivo|
Estable|Negativo>`, so band + outlook read without color. Existing word-bearing chips
(`Estado: …`, `outlookMeta.label`, `Watch`, `Demo`) already satisfied this; score badges in
tables sit next to the worded Estado column.

**(c) Keyboard.** Added shared `embatFocusRing` (2px `#11a8ff`, 2px offset, `outline-solid`)
and `embatRowFocusRing` (inset) in `chrome.tsx`. Applied to: `FilterChip` trigger,
`EmbatButton` (all variants), `FilterField` input + submit, `embatSelectTriggerClass`,
`embatSelectItemClass` (white, visible on the blue focus fill), `RationaleTip` trigger,
all filter/popover option buttons, table/grid links, `Comparar`, the row checkbox, and
focusable `<tr>` rows. Search inputs use a `focus-within` ring on their wrapping label.

**(d) Overflow / alignment.** `tabular-nums` on every numeric column and numeric badge:
score/estado chips, implied rate, cash, group `n_companies`, sub-scores, driver deltas,
action amounts/uplift, anticipation tiles (PeerTile already had it). `title` added to the
member name/id in the group card; existing name/situation/best-company titles kept. Long
company names: `min-w-0 break-words` on `FichaTitle`; group-table header now `flex-wrap`
so the search field drops below the title at narrow (`max-lg:`) widths; company-table
header right group is now `flex-wrap min-w-0` with `max-w-full` search.

**(e) Consistency.** Removed `backdrop-blur-md` + `bg-white/95` from the sticky compare
bar (glassmorphism ban) → solid `bg-white`, matching every other surface. No radii >8px,
no gradient text, no side-stripe borders introduced.

**(f) Motion.** Only `transition-colors duration-150 ease-out` on hover/focus for buttons,
chips, option items, and rows — color only — each guarded with `motion-reduce:transition-none`.

## Verification (from `web/`)

- `npm run typecheck` → clean (no output).
- `npm test` → 37 files / 180 tests passed. (First full run hit a cold-cache 5s timeout in
  `live-data.smoke.test.ts`; isolated re-run passed in 0.5s and the second full run was green.)
- `npx eslint components/embat` → **0 errors**, 2 pre-existing `no-img-element` warnings
  (the untouched `EmbatIcon` / `RationaleTip` `<img>` tags). No new lint errors in scope.
  The repo-wide `npm run lint` noise (89 errors / 8802 warnings) is entirely outside
  `components/embat` (generated `web/.eve/**` dev bundle plus template `ai-elements`,
  `ui/carousel`, `xray` and `hooks/xray` react-hooks findings) and is reproducible without
  these edits.
- `package-lock.json` unchanged. (`node_modules` was absent; an additive `npm install` was
  run to make typecheck/test executable, leaving the lockfile intact.)
