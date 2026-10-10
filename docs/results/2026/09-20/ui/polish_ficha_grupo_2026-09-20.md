# Polish ficha de empresa y ficha de grupo

Pase de refinamiento (no rediseño) sobre `web/components/embat/*` y
`web/lib/xray/snapshot.ts`. Sin cambios de identidad ni de copy factual salvo
los puntos pedidos. No se tocó ningún fichero fuera de la propiedad.

Rutas de prueba: `c/COMP_0001` y `g/GROUP_0147` (dev server ya arrancado).

## Hallazgos

1. **Narrativa técnica bajo el gauge** (`/c/COMP_0001`): el texto
   `Índice de salud 59.9 (outlook stable, tendencia flat). Actualizaciones:
   cash_buffer_days (-1.7 pts…); … DSCR 6m = 6598.41.` exponía ids de feature en
   inglés, decimales con punto y un DSCR crudo sin sentido para el gestor.
2. **Eje X de Trayectoria**: el último tick se recortaba a 1440 px
   (`feb 2027` r=836 > card 833) y a 390 px los ticks se pisaban (7 etiquetas
   largas, pares con solape de 2–4 px).
3. **Trayectoria vacía en `/g/GROUP_0147`**: la tarjeta medía 242 px y no
   pintaba SVG. Causa raíz: `TrajectoryCard` dependía de un `flex-1` con
   `h-full`; en la columna del grupo el alto del contenedor no era definido y
   el `height:100%` interno colapsaba a 0. Además la fila superior dejaba un
   hueco de ~380 px: Actualizaciones (300) junto a Score (680).
4. **Chip `Ensayo`** flotando suelto encima de las tarjetas.
5. **Benchmarking**: eje y chips con ids `COMP_xxxx` en vez del nombre.
6. **Acciones recomendadas a 390 px**: `Acción Conf. Importe` se apiñaba.
7. **Revisión gauge / chips / diálogo de señales**: el chip de tendencia no
   decía a qué se refería; el medidor de confianza usaba un hex suelto; el
   diálogo formateaba con punto decimal y usaba glifos `↑`/`↓`.

## Cambios por fichero

- `web/lib/xray/snapshot.ts` — `buildScoreExplanation` reescrita en español
  llano: usa `outlookMeta`+frase de tendencia, `signalLabel`, `formatNumber` y
  `formatSignedNumber` (coma decimal es-ES) y `formatMonth`; quita el DSCR
  crudo y solo menciona la cobertura de cuotas cuando está por debajo del
  mínimo (1,2). Sin ids con guion bajo, sin *outlook*, sin *flat*.
- `web/components/xray/score-trajectory.tsx` — helper `shortMonth` (`mar 26`),
  margen derecho `20` en modo embat y `interval="preserveStartEnd"` +
  `minTickGap` para que el eje no se recorte ni se pise.
- `web/components/embat/ficha.tsx` —
  - `TrajectoryCard`: alto de gráfico definido (`h-[238px]`) y `EmptyState`
    explícito si no hay histórico (arregla el colapso a 0 px).
  - `HealthScoreCard`: nuevo `headerExtra` para integrar el chip `Ensayo` en la
    cabecera; el chip de tendencia pasa a `Tendencia: Plano`.
  - `AccionesCard`/`ActionRow`: `Conf.` e `Importe` ocultos por debajo de `sm`.
  - `ConfidenceMeter` y skeletons: `bg-[#dce0e6]` → token `bg-border`.
- `web/components/embat/grupo.tsx` — fila superior reordenada: Score a la
  izquierda y columna derecha con Actualizaciones + Trayectoria apiladas, de
  modo que la columna rellena el alto del score; el chip `Ensayo` se pasa a la
  cabecera de la tarjeta de score.
- `web/components/embat/peers-benchmark.tsx` — eje Y con nombre truncado
  (`truncateName`, ancho 96), tooltip `nombre · COMP_xxxx`, chips de vecinos con
  nombre enlazado y `title` con el id.
- `web/components/embat/signals-dialog.tsx` — valores en es-ES
  (`formatNumber`) y polaridad con palabras (`Más es peor` / `Menos es peor`).
- `web/tests/unit/lib/xray/snapshot.test.ts` — assertions actualizadas a la
  narrativa nueva (coma decimal, etiquetas en español, sin ids/outlook/flat).

## Evidencia

Sondeo de solapes (`node node_modules/.cache/shot/shot.mjs`), antes y después:

```
antes  /c/COMP_0001 @1440: 0 overlaps   scrollWidth 1440,1440
antes  /g/GROUP_0147 @1440: 0 overlaps  scrollWidth 1440,1440
antes  /c/COMP_0001 @390:  0 overlaps   scrollWidth 390,390
antes  /g/GROUP_0147 @390: 0 overlaps   scrollWidth 390,390

después /c/COMP_0001 @1440: 0 overlaps  scrollWidth 1440,1440
después /g/GROUP_0147 @1440: 0 overlaps scrollWidth 1440,1440
después /c/COMP_0001 @390:  0 overlaps  scrollWidth 390,390
después /g/GROUP_0147 @390: 0 overlaps  scrollWidth 390,390
```

Narrativa bajo el gauge, después (`/c/COMP_0001`, 1440 y 390):
`Índice de salud 59,9 · Estable, tendencia plana. Últimos movimientos: Días de
colchón de caja − 1,7 pts desde ago 2026; Tasa de impago a 3 meses + 1,4 pts
desde ago 2026; Flujo de caja neto a 3 meses + 0,9 pts desde ago 2026.`

Trayectoria, después (geometría de ticks, `cardRight` = borde de la tarjeta):

- `c/COMP_0001` 1440: 7 ticks `mar 26 … feb 27`, último `r=817,5 < 833` (sin recorte).
- `c/COMP_0001` 390: 4 ticks (`mar/may/jul/feb`), último `r=350,5 < 366`, sin solape.
- `g/GROUP_0147` 1440: `chartFound: true`, último tick `r=1376,5 < 1392`.
- `g/GROUP_0147` 390: `chartFound: true`, mismo eje sin solape.

Layout de grupo, después (1440): Score `y=96..776` (h=680); columna derecha
Actualizaciones `96..421` (325) + Trayectoria `451..776` (325) → sin hueco.
`Ensayo` dentro de `header` de la tarjeta `Score de salud`.

Benchmarking: eje y chips muestran `Iberia Group…`, `Norte Ops 921`, … y el
tooltip añade `· COMP_xxxx`.

Acciones a 390: `Conf.` e `Importe` con ancho 0 (ocultos); se leen `Acción` y `Δ`.
A 1440 siguen visibles las cuatro columnas.

Diálogo de señales: `1,8 %`, `6598,4`, `-12,3 %` con coma decimal y polaridad
`Más es peor` / `Menos es peor`. Sin errores de consola nuevos (solo los 409/503
preexistentes de endpoints de IA).

Verificación: `npm run typecheck` OK; `npm test` 323 passed / 2 skipped.

## Fuera de alcance (no tocado)

- `components/xray/score-gauge.tsx` (no es propiedad): el tooltip usa
  `value.toFixed(1)` → `59.9` con punto, no es-ES. Queda como hallazgo.
- `#eb002b` (aviso crítico) y `#ef8000`/`#6d28d9`: deuda ya documentada en
  `DESIGN.md`, no tokenizada en este pase.
- `lib/xray/group-score.ts` y los mensajes de alerta `DSCR 6m = …` siguen
  igual (fichero no propiedad).
- `treasury-chart.tsx` no necesitó cambios: su eje ya reduce ticks solo.
- No se añadió un `formatShortMonth` a `lib/xray/format.ts` (no propiedad); el
  helper corto vive local en `score-trajectory.tsx`.
