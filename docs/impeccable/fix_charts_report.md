# Fix de gráficos de la ficha — critique v2 (impeccable)

Árbol de trabajo sin commit sobre `003cb43`. Modelo: **`helm/deepseek-v4-flash`** (`opencode.json` raíz).
Ficheros propios tocados: `web/components/xray/score-trajectory.tsx`, `dimension-radar.tsx`,
`score-uplift.tsx`, `web/components/embat/treasury-chart.tsx`, `peers-benchmark.tsx`.
APIs hacia los ficheros de otros workers intactas (solo props existentes; ninguna nueva obligatoria).

## Cambios (uno por hallazgo)

1. **[P0] Eje temporal real y abanico a 6 meses** — `score-trajectory.tsx:46` (`futureMonths`), `:274-287` (el último mes real recibe p10/p50/p90 y se insertan 5 meses intermedios nulos + t+6 con la banda; `connectNulls` la dibuja en seis pasos reales), `:509-512` etiqueta en gráfico «Abanico 80 % · 6 meses», `:64,516` leyenda p10/p50/p90 en modo `embat` (`FanLegend`, reutilizada por la rama no-embat en `:528`). API de `ScoreTrajectory` sin cambios.
2. **[P2] Signo del driver** — `score-trajectory.tsx:221-222` (dots) y `:466-472` (popover) usan el signo de `driver.delta` (positivo = bueno), así el dot coincide con el badge de la ficha; `driverIsGood` ya no se importa aquí y sigue disponible en `lib/xray/signal-labels.ts` para otros usos.
3. **[P1] Alternativa accesible (4 gráficos)** — `role="img"` + `aria-label` es-ES y tabla `sr-only` con las mismas cifras en: `score-trajectory.tsx:131,176` (comparativa) y `:289,409,506,524` (serie), `dimension-radar.tsx:82,112`, `treasury-chart.tsx:62-71,114,192`, `peers-benchmark.tsx:60-66,89,143`.
4. **[P2] Comparables por nombre** — `peers-benchmark.tsx:28` (`shortName`), `:100-106` (eje etiquetado por nombre vía `tickFormatter`), `:102` (ticks `#666` a 11 px, ya no `#999`/10 px), `:172` (chips con `n.name`), `:78` (título «Comparables» en vez de «Benchmarking»).
5. **[P2] Tesorería en la moneda dada** — `treasury-chart.tsx:65,69-72` (aria-label), `:97,100` (cabecera), `:148` (tooltip), `:207-210` (tabla) usan `formatCurrency(value, currency)`; `:35-46` eje compacto *currency-aware* (`compactCurrency`, porque `formatCurrency` completo desborda el eje de 48 px) y `:100` etiqueta es-ES «Abanico 80 % · mediana a 6 meses». `formatCompactEuro` ya no se usa en el fichero.
6. **[P2] `font-mono` fuera** — `score-uplift.tsx:21`: `font-mono` → `tabular-nums` sobre la pila Inter heredada del chrome.

Convenciones respetadas: borde/rejilla `#dce0e6`, ticks `#666`/`#6b6b6b`, serie propia `var(--primary)`,
transiciones solo de color/opacidad con `motion-reduce`. Sin dependencias nuevas, sin commit.

## Verificación

- `npm run typecheck` **limpio** (primera pasada con 6 errores TS2304 **solo** en `embat/ficha.tsx`, fichero de otro worker a medio editar; tras esperar 60 s la segunda pasada salió limpia).
- `npm test` **verde**: 43 ficheros / 201 tests. Incluye `lib/xray/snapshot.test.ts`, que hace `renderToStaticMarkup` de `DimensionRadar`/`ScoreTrajectory` y confirma que renderizan en servidor.
- `GET http://localhost:3000/c/COMP_0003` → **200**; el HTML servido **no** contiene `Trayectoria`, `role="img"` ni «Abanico 80 % · 6 meses»: el cuerpo de la ficha es un componente cliente (`useCompanyScore`) y el gráfico solo existe tras resolver el fetch, así que su `aria-label` no puede aparecer en el SSR por diseño (coincide con `docs/impeccable/critique_ficha_v2.md`). Para esta comprobación se levantó `npm run dev` en segundo plano; el dev server del repo muere por un error previo del agente eve (`agent/tools/get_method_metrics.ts`, «eve server process exited…»), ajeno a estos ficheros, y se detuvo después.
