# Polish — marketplace, comparar, ajustes y chrome de X Ray (2026-09-20)

Pase de refinamiento sobre el chrome Embat y el marketplace, sin rediseño: misma
identidad, mismo copy factual salvo donde se indica. Solo se editaron ficheros de
mi propiedad. Sin commit.

## Hallazgos (los cinco del coordinador, más lo que se vio al abrir el código)

- **a) `/compare` sin selección.** El estado eran una línea gris «Elige 2 o 3
  empresas en Empresas» y un enlace verde, sin tarjeta ni explicación del gesto.
  Además había una segunda rama («No hay score para esas empresas») con el mismo
  patrón pobre.
- **b) `/settings`.** Entraba directamente en la tarjeta de Slack: sin `h1` ni
  descripción de página. El botón «Conectar» se deshabilitaba con el campo vacío
  (verde al 50 % = lavado) y el éxito se pintaba en gris `muted-foreground`, sin
  palabra ni icono de estado.
- **c) `app-shell.tsx`.** El pie del sidebar mostraba la identidad de plantilla
  «AV / Alvaro Villalba» (nombre real del equipo usado como cuenta demo; la
  critique previa ya lo marcó como chip de cuenta de plantilla). El header ya
  medía 48 px (`min-h-12`) y el trigger ya llevaba `sr-only`, así que ahí no había
  defecto; el sidebar móvil ya se monta como `Sheet` (abre/cierra solo) y no
  genera scroll horizontal.
- **d) Marketplace y detalle.** El uplift what-if se rotulaba «Health Score» en el
  pie del rail (`ofertas.tsx`) y «Mejora proyectada del score» en el detalle, sin
  declararlo estimación. `FeeBadge` llevaba hex violeta sueltos
  (`bg-[rgba(163,75,203,0.1)]` / `text-[#6d28d9]`). En el diálogo de contratar
  quedaban varios valores arbitrarios (`bg-[#dce0e6]`, sombras
  `rgba(13,19,30,0.1)`, `rgba(220,224,230,0.3)`) y los textos del flujo eran
  genéricos. El cuerpo del diálogo era de dos columnas fijas también en móvil.
  `amortize-dashboard.tsx` usaba `font-mono` en cifras (fuente monoespaciada que
  el sistema no tiene) y su estado vacío era un `<p>` suelto.
- **e) Diálogo Cmd K.** Ya enfocaba el input (cmdk) y cerraba con Escape, pero el
  estado sin resultados era un «No hay resultados.» sin recuperación y los chips
  de filtro/badges usaban radio `rounded-lg` (fuera de la escala `--radius`).

## Cambios por fichero

- **`web/components/embat/offer-ui.tsx`** — `FeeBadge`: `bg-violet-700/10` y
  `text-violet-700` en lugar de los hex/`rgba` sueltos (token de la paleta ya
  existente; no se toca `globals.css`).
- **`web/app/compare/page.tsx`** — los dos fallos pasan a `EmptyState`
  `placement="page"` de `feedback-state.tsx`, con el gesto concreto («marca dos o
  tres compañías con la casilla de la izquierda y pulsa Comparar») y una CTA
  `Ir a Empresas` con `embatFocusRing`.
- **`web/app/settings/page.tsx`** — `h1` «Ajustes» (Inter Display 20 px) y
  subtítulo. El botón ya no se deshabilita con el campo vacío: valida al enviar y
  da error con recuperación («Pega la URL del webhook…»). Error con icono y
  `role="alert"`; éxito con check `text-positive` (y triángulo ámbar si Slack
  falló) y `aria-live`; `aria-invalid`/`aria-describedby` en el input;
  `aria-busy` en el form y en el botón; «Desconectando…» mientras borra.
- **`web/components/xray/app-shell.tsx`** — el pie sustituye la identidad personal
  hardcodeada por una etiqueta de entorno neutra («Entorno de ensayo», icono
  `FlaskConical`), coherente con el chip «Ensayo» ya existente. Se elimina el
  import de `Avatar`.
- **`web/components/embat/ofertas.tsx`** — el rail rotula «Impacto estimado en el
  score» sobre `ScoreUplift` + `ScoreDeltaBar` y aclara «Estimación what-if del
  modelo…»; se elimina «Health Score» del pie. Título «Importe recomendado» con
  el importe tabular; descripción de fila con `tabular-nums`; los badges de
  ahorro/fee siguen alineados a la derecha.
- **`web/components/xray/product-detail.tsx`** — el bloque pasa a «Impacto estimado
  en el score» + nota «Estimación what-if del modelo, no una probabilidad de
  impago.»
- **`web/components/embat/contratar-prestamo.tsx`** — overlay `bg-black/30`,
  sombras `shadow-sm`, progreso `bg-border`, última fila `bg-border/30`. Textos:
  «Solicitar oferta», «El emisor está revisando la solicitud… {n}s»,
  «Aceptar y contratar», `aria-live` en el progreso. El diálogo apila en móvil
  (`flex-col sm:flex-row`) con borde inferior en vez de derecho.
- **`web/components/xray/amortize-dashboard.tsx`** — estado vacío del cuadro de
  deuda con `EmptyState` `placement="card"`; `font-mono` fuera de las cifras
  (quedan `tabular-nums`); `aria-label` en la tabla de deuda.
- **`web/components/xray/search-dialog.tsx`** — `autoFocus` y `aria-label` en el
  input; `CommandEmpty` con recuperación («Prueba otro nombre o identificador, o
  cambia el filtro.»); chips de filtro, badges e icono del preview a `rounded-xl`.
- **`web/components/xray/feedback-state.tsx`** — sin cambios: ya era la fuente
  correcta de estados.

## Evidencia

Comando: `MSYS_NO_PATHCONV=1 node node_modules/.cache/shot/shot.mjs <salida> <rutas>`
desde `web/` (PNG a 1440 y 390 px + sondeo de solapes y scrollWidth por consola).

- **Antes** (compare, settings, `c/COMP_0001`, marketplace `c/COMP_0001/a/COMP_0001-new_debt-0`,
  detalle `…/p/cat_bbva_circulante`):
  - 1440 px → 5 rutas, **0 solapes** cada una, `scrollWidth/clientWidth = 1440,1440`.
  - 390 px → 5 rutas, **0 solapes** cada una, `scrollWidth/clientWidth = 390,390`.
- **Después** (mismas cinco rutas):
  - 1440 px → **0 solapes** cada una, `1440,1440`.
  - 390 px → **0 solapes** cada una, `390,390`.
- **Extra determinista** `c/COMP_1068/a/COMP_1068-amortize-0` (rama amortize de
  `ofertas.tsx`): 1440 px **0 solapes** `1440,1440`; 390 px **0 solapes**
  `390,390`. El DOM muestra el cuadro de deuda con cifras tabulares alineadas a
  la derecha y el estado vacío correcto.
- **Cmd K** (Playwright): tras `Control+K` el `activeElement` es
  `INPUT[command-input]`; con «zzzz-no-existe» el vacío dice «No hay resultados.
  Prueba otro nombre o identificador, o cambia el filtro.»; `Escape` cierra el
  diálogo (0 nodos).
- **Texto renderizado** `/compare`: «Elige 2 o 3 empresas para comparar | En
  Empresas, marca… con la casilla de la izquierda y pulsa Comparar… | Ir a
  Empresas». `/settings`: `H1: ["Ajustes"]` + subtítulo + tarjeta Slack.
  Sidebar: «… Ajustes | Entorno de ensayo».

## Verificación

- `npm run typecheck` → limpio.
- `npm test` → **67 ficheros pasan / 2 saltados; 323 tests pasan / 0 fallan**.
  Durante el pase hubo 2 fallos en `web/tests/unit/lib/xray/snapshot.test.ts`
  (esperaban `Índice de salud 56.9` / `por debajo del suelo`) por cambios de otro
  worker en `lib/xray/snapshot.ts` + `lib/xray/format.ts`, fuera de mi propiedad.
  El coordinador indicó dejarlo como bloqueo ajeno; ese worker ya actualizó las
  expectativas y la suite quedó verde sin tocar yo su test.

## Fuera del pase (dejado consciente)

- **Rutas de marketplace con IA no capturables aquí.** `/c/COMP_0001/a/…` y su
  detalle dependen de `POST /api/xray/recommend` (Eve); sin clave de modelo en
  este entorno devuelven 502 y renderizan `AiFailureState` / «Producto no
  encontrado». El sondeo de solapes sale limpio, pero no se pudo ver la lista de
  ofertas real. La rama amortize (determinista) sí se capturó.
- `formatCurrency` sin moneda en `amortize-dashboard.tsx`: la empresa GBP se pinta
  en € y la «caja disponible» sale con un valor absurdo (dato de contexto, no de
  formato). Es un defecto real pero toca `format.ts`/semántica de `ctx`, ajeno a
  este encargo; queda anotado.
- `ScoreUplift`/`ScoreDeltaBar` conservan `font-mono` y el `aria-label` «Score …»
  (no son mi propiedad), y la página de producto resuelve «no encontrado» con
  texto plano (fuera de `product-detail.tsx`).
- Inspección visual de píxeles: el modelo de esta sesión no admite entrada de
  imagen, así que la valoración se hizo por código y por volcado de DOM/consola,
  no mirando los PNG.
