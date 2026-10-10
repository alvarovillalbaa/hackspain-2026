# Fix ficha — informe de cambios

Modelo: `helm/deepseek-v4-flash` (`opencode.json` raíz). Alcance: `web/components/embat/ficha.tsx`,
`compania.tsx`, `signals-dialog.tsx`. `npm run typecheck` limpio y `npm test` verde (201/201) al cerrar.
Sin cambios en `lib/`, `hooks/`, `app/`, schemas ni API; sin dependencias nuevas; sin commit.

1. **[P0] Jerarquía invertida en `HealthScoreCard`** — el titular pasa a texto: `Banda` + `bandMeta(snapshot.band).label` con el outlook al lado, a 28 px, y `Datos a {formatMonth(snapshot.month)}` debajo; el gauge queda de apoyo, recibe `band` y conserva su caption. La banda se lee sin color (texto). `ficha.tsx:217` (lead en `:253-267`, gauge `:269-273`).
2. **[P0] `watch` visible** — fila inline tranquila (sin barra roja) con `watchMeta(snapshot.watch).label` + `description` y siguiente paso `Ver acciones` cuando hay `actionsHref`; el banner crítico DSCR mantiene su comportamiento y gana el enlace `Ver acciones`. `ficha.tsx:279-303` (watch) y `ficha.tsx:89-118` (`FichaFrame`).
3. **[P1] `explanation` y affordance de rationale** — se pinta `snapshot.explanation` bajo el gauge/lead traducido a es-ES puro (`plainExplanation`, `ficha.tsx:67`); el disparador de `RationaleTip` sube a 24×24 px con etiqueta visible `Por qué` + `aria-label`, conservando el popover. `ficha.tsx:274-277` y `ficha.tsx:470-488`.
4. **[P1] Bug de `SignalsDialog` sin `ranks`** — se elimina la prop `ranks`/`isRedRank`; el rojo se decide por señal con una escala de riesgo (`signalRisk`, `signals-dialog.tsx:27-46`), se eligen las `snapshot.n_red` peores (`redSignalKeys`, `:48-62`) y la cabecera cuenta exactamente las tarjetas teñidas (`:78-88`), con marca textual `En rojo` (`:122`); la línea de percentil inexistente se elimina.
5. **[P1] Cierre en acción** — `AccionesCard` se mueve al final de `Compania`, tras trayectoria/tesorería y antes de `DealFichaCard`; el comportamiento de la oferta aceptada se mantiene. `compania.tsx:126-152`.
6. **[P1] Unidades y jerarquía** — cabecera de columna `Uplift (pts)` con nota what-if al lado; `currency` viaja de `compania.tsx` a `AccionesCard`/`ActionRow` y el importe usa `formatCurrency`; los cinco sub-scores se agrupan pequeños y neutros con rótulo `Sub-scores · escala 0–100`. `ficha.tsx:306-325`, `:397-410`, `:504-519`, `:536-541`; `compania.tsx:142`.
7. **[P2] Trayectoria, código muerto y copy** — rango por defecto 6 meses y chip activo (`ficha.tsx:578`, `:600`); se eliminan `FichaTitle`, `FichaChips`, `DimensionsFichaCard`, `PeersFichaCard`, `PeerTile` y `SubScoreRow` con sus imports; `FichaSkeleton` se alinea a `min-h-[300px]` sin cajas 428×266 (`:641`); `Health Score` → `Score de salud` (`:241`) y `Conf.` → `Confianza` (`:536`).

## Verificación observable

- `npm run typecheck` → sin errores. `npm test` → 43 ficheros, 201 tests en verde.
- `GET /api/xray/score/COMP_0087` (200) devuelve `band CCC`, `watch expensive_new_debt`, `n_red 1`; `COMP_0003` → `n_red 2`.
- `GET /c/COMP_0003` y `/c/COMP_0087` (200) sirven el shell; el cuerpo es cliente y el HTML SSR sólo trae el skeleton (ya documentado en la crítica), por lo que la banda/watch no están en el HTML servido.
- Para comprobar el marcado real se renderizaron `HealthScoreCard` con los snapshots de `scores.json`: `COMP_0003` contiene `Banda`, `CCC`, `Negativo` y `Datos a`; `COMP_0087` contiene `Watch · deuda cara`, `percentil 75` y `Ver acciones` (test temporal, ya eliminado).
- Nota de entorno: `npm run dev` aborta al arrancar el servidor eve (`agent/tools/get_method_metrics.ts`, ajeno a estos ficheros); la verificación se hizo con `npx next dev` bajo `VERCEL=1`, que sirve sólo la app Next.
