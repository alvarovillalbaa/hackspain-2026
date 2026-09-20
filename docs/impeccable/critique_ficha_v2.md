# Critique v2 — ficha de compañía `/c/[companyId]`

`Method: ⚠️ DEGRADED: single-context (no se ejecutaron los dos assessments A/B como sub-agentes aislados; una sola pasada de inspección de código + API + HTML SSR). Sin browser automation expuesto: no hubo captura visual ni overlay.`

Modelo del revisor: **`helm/deepseek-v4-flash`** (`opencode.json` raíz).

Target resuelto: `web/app/c/[companyId]/page.tsx` → `web/components/embat/compania.tsx` → `web/components/embat/ficha.tsx` (+ `signals-dialog.tsx`, `peers-benchmark.tsx`, `treasury-chart.tsx`, `chrome.tsx`, `font.ts`), el shell `web/components/xray/app-shell.tsx`, los embebidos `score-gauge.tsx`, `score-trajectory.tsx`, `dimension-radar.tsx`, `score-uplift.tsx`, `driver-list.tsx`, y los tokens de `web/app/globals.css`.

Snapshot de código: **HEAD `b800d3a`** (el merge de PR #34; el diff tracked estaba vacío al empezar la revisión). El informe juzga ese estado, que es el que se sirvió durante la inspección.

> **Aviso de objetivo móvil (leer antes de actuar).** Mientras se escribía este informe, otro worker ha empezado a editar sin commit `web/app/globals.css` y 16 ficheros de `web/components/embat/`, y esas ediciones **ya corrigen varios hallazgos de abajo**. Lo observado en el diff al cerrar: (a) `FichaGauge` ya recibe y pinta `bandMeta(band).label` junto a outlook (`ficha.tsx`, `HealthScoreCard`); (b) los títulos/subtítulos pasan de `#999` a `#6b6b6b` (≈5,3:1, pasa AA); (c) se añade anillo de foco `embatFocusRing` a «Ver señales», `ConfidenceMeter`, `RationaleTip` y enlaces de acción; (d) `--primary` vuelve a `#11a8ff` y `--radius` a `0.25rem` (`globals.css:162-172`). Por tanto, los P0 de **banda ausente** y **contraste de títulos** y parte del P1 de **foco** deben re-verificarse contra el árbol de trabajo antes de re-arreglarlos; el resto (watch invisible, abanico ilegible, mes no mostrado, jerarquía foto-primero, cierre sin acción, bug de señales en rojo) sigue vigente en el diff. Las líneas de `embat/` pueden desplazarse.

---

## Qué se pudo y qué no se pudo observar

- **Sí (SSR):** `GET /c/COMP_0218` devuelve `X Ray · Buscar · Empresas · Dashboard · Acciones · Productos · Ajustes · AV Alvaro Villalba · Empresas / COMP_0218 · Actualizar datos`. El cuerpo de la ficha es un componente cliente (`useCompanyScore`) y **no** aparece en el HTML servido: sólo se ve el shell, el breadcrumb y el botón «Actualizar datos».
- **Sí (API real):** `/api/xray/score/COMP_0218`, `COMP_0087` (watch `expensive_new_debt`) y `COMP_0003` (outlook `negative`, `n_red=2`). Se usan para juzgar qué se renderizaría.
- **No:** no hay herramienta de navegador en esta sesión, así que no hay captura, ni inspección de foco/estados, ni overlay del detector. Todo lo visual de abajo es lectura de fuente + cálculo de contraste, no píxeles.
- El detector `impeccable detect --json web/components/embat` devolvió `[]` (exit 0); en `.tsx` es un escáner regex y no ve contraste, jerarquía, IA ni copy. Limpio mecánicamente ≠ bien diseñado.

---

## Design Health Score

Modo de la superficie: **Operate** (app/dashboard). Por tanto los 10 heurísticos aplican; máximo **/40**.

| # | Heurística | Score | Problema clave |
|---|-----------|-------|----------------|
| 1 | Visibility of System Status | 2 | Hay skeleton y error, pero el **mes de los datos no se muestra en ninguna parte** (`FichaTitle` es código muerto), el abanico no declara horizonte ni intervalo, y la banda/watch no existen en pantalla. |
| 2 | Match System / Real World | 2 | Señales ya en es-ES (bien), pero quedan `Health Score`, `Benchmarking`, la columna `Δ`, `Conf.`, `fan 6m p50`, `MPC` y el `explanation` crudo en inglés/snake_case sin renderizar (`snapshot.ts:12-35`). |
| 3 | User Control and Freedom | 3 | Breadcrumb de vuelta a Empresas, popovers y diálogo; el rango de trayectoria vive en un chip poco obvio y arranca en 3. |
| 4 | Consistency and Standards | 3 | Badges unificados por `statusClass`/`scoreBadgeClass`; mejoró el aviso «what-if» de la oferta. Pero umbrales 60/40 (`chrome.tsx:53-57`) ≠ cortes de banda 68/55 (`bands.ts:14-24`), y conviven dos verdes (`#146c43` primary y `#00a14e` estado). |
| 5 | Error Prevention | 3 | Pocas acciones destructivas; import en diálogo; aviso DSCR. |
| 6 | Recognition Rather Than Recall | 2 | `SignalsDialog` ya explica cada señal (gran avance), pero el «porqué» narrativo sigue oculto, `watch` no existe, el abanico no se explica y el rationale vive tras un icono de 10px. |
| 7 | Flexibility and Efficiency | 2 | Sin atajos ni export; cada fila de acción son 3 `<Link>` con 2 `tabIndex={-1}` (`ficha.tsx:409-431`); rango por popover. |
| 8 | Aesthetic and Minimalist Design | 2 | Superficie limpia, pero son seis tarjetas iguales + cuatro cantidades 0–100 compitiendo (gauge, cinco sub-scores, media vecinos, uplift) y el gauge rellena con vacío una tarjeta de 300px. |
| 9 | Error Recovery | 2 | Error visible pero sin «Reintentar» ni enlace (`compania.tsx:102-106`). |
| 10 | Help and Documentation | 2 | `SignalsDialog` y los popovers de confianza/outlook aportan ayuda contextual real (v1 puntuaba 1); sigue sin haber definición de banda/watch/abanico ni ayuda de ruta. |
| **Total** | | **23/40** | **Acceptable (57,5 %)** |

Lectura: **+2 respecto a la v1 (21/40)**. La subida viene de la ayuda contextual, las etiquetas es-ES de señal y la sustitución del cyan por un primary que sí pasa AA. El bloqueo estructural no ha cambiado: el producto se llama trayectoria y la ficha sigue encabezada por la foto.

---

## Design Specificity Verdict

**Especificidad media-baja.** El chrome Embat (Inter, radios, cream) da coherencia, pero el **cuerpo de la ficha es una rejilla de tarjetas genérica de dashboard** que un producto de analytics distinto podría usar sin cambiar nada. El único elemento potencialmente propio —el abanico a 6 meses— está enterrado, mal escalado en el tiempo y sin leyenda.

**Lo que sí es de este producto**

- Tipografía y radios centralizados y reales: Inter Variable / Inter Display, `radius` 1rem, `.embat-ui` con `--border:#dce0e6`, `--muted-foreground:#666` (`globals.css:154-177`, `font.ts:1-29`). Ahora esto **también alcanza a `DimensionRadar`**, que usa `var(--border)`/`var(--muted-foreground)` y por herencia del shell toma tokens Embat: la v1 lo marcaba como anti-referente y ha quedado absorbido por el override de tokens.
- Micro-componentes propios y reutilizados: `statusClass`, `signedBadgeClass`, `scoreBadgeClass`, `FilterChip`, `EmbatButton`, `fichaCardClass` (`chrome.tsx:37-120`, `ficha.tsx:51-52`).
- `SignalsDialog` es la pieza más "de este producto": etiqueta, blurb y polaridad por señal (`signals-dialog.tsx:66-113`) — el "cada cifra tiene su porqué" de `PRODUCT.md:64` hecho interfaz.

**Dónde se cuela el patrón de categoría**

- **Plantilla "hero-metric"** (número grande + etiqueta pequeña + stats de apoyo + acento) en `HealthScoreCard` (`ficha.tsx:254-317`): es literalmente uno de los scaffolds que `craft-floor.md:25` pide rechazar cuando el eje está libre.
- **Seis tarjetas del mismo tamaño** con cabecera idéntica (h2 14px `#999` + borde inferior) son el scaffold "same-size cards" (`craft-floor.md:25`).
- El shell es **todavía una consola de cartera** (`Empresas / Dashboard / Acciones / Productos`, `app-shell.tsx:28-33`) para un producto cuyo usuario es el CFO de **una** pyme (`PRODUCT.md:11`). La v1 pedía un nav de una sola compañía; el renombrado `Grupos/Compañías/Ajustes → Empresas/Dashboard/Acciones/Productos` mitiga la jerga heredada, no el modelo.
- La identidad del sidebar «AV / Alvaro Villalba» (`app-shell.tsx:129-139`) es un chip de cuenta de plantilla.

**Marca:** el wordmark dice «X Ray» y `PRODUCT.md:49` insiste en que Embat es el cliente, no la marca; sin embargo la superficie viste el chrome Embat sin ninguna señal material de X Ray (ni un motivo, ni una razón de ser del cream). Es herencia, no identidad.

---

## Overall Impression

Es una ficha **tranquila y ordenada** que sabe no gritar: el banner rojo quedó reducido al suelo DSCR y en español, las señales se leen en castellano y el primary nuevo pasa contraste. Pero el primer pantallazo sigue diciendo lo contrario del posicionamiento: una tarjeta de **Health Score** con un 40px, sin banda, sin watch y sin fecha, y el abanico a seis meses en la segunda fila, con chip «3 meses» y un eje que falsea el tiempo. La mayor oportunidad no es pulir tarjetas: es **invertir la jerarquía** (banda + outlook + watch + abanico como titular; el número como pie) y **terminar en acción**.

### Qué funciona

1. **Señales humanizadas.** `signalLabel`, `signalBlurb`, `signalPolarity` (`signal-labels.ts`) convierten `cash_buffer_days` en «Días de colchón de caja» y explican la dirección. Es el mayor salto respecto a la v1.
2. **El «porqué» por señal ya es visible a un clic.** `SignalsDialog` da nombre, descripción, valor y polaridad; `ConfidenceMeter` y los badges de outlook/trend dan contexto con tooltip (`ficha.tsx:199-252,277-291`).
3. **Un chrome discreto** (en HEAD): `#146c43` sobre blanco 6,45:1, sobre cream 5,83:1; `#666` 5,74:1. En ese estado el fallo de contraste del cyan de la v1 estaba resuelto en los elementos interactivos; con la vuelta a `#11a8ff` del árbol de trabajo, no.

---

## Contrast checks (ratios WCAG calculados; texto normal exige 4,5:1, texto grande 3:1)

Paleta en el estado evaluado (HEAD): el token `--primary` de `.embat-ui` era **`#146c43`** (`globals.css:162`), confirmado en el CSS que sirvió el dev server durante la revisión. **El árbol de trabajo actual del worker concurrente ya lo ha devuelto a `#11a8ff`** (y `--radius` a `0.25rem`), que es el cyan que anuncian `docs/frontend_v0.md:5` y el enunciado. Ojo: con `#11a8ff` como primary vuelven los fallos de la v1 — `#11a8ff` sobre blanco **2,60:1**, sobre cream **2,35:1**, sobre tinte 15 % **2,06:1**, y `#ffffff` sobre `#11a8ff` **2,60:1** — así que el P0 de contraste de controles sigue vivo en cuanto se aplique la vuelta a cyan. En HEAD, `#11a8ff` sólo sobrevivía en `anticipacion.tsx:52` (fuera de la ficha).

| Color de texto | Sobre `#ffffff` | Sobre `#f6f3ee` (sidebar cream) | Dónde se usa | Veredicto |
|---|---|---|---|---|
| `#999999` | **2,85:1** | **2,57:1** | Todos los títulos de tarjeta, cabeceras de columna, subtítulos y fechas: `ficha.tsx:272,326,351,399,406,412,490,494,548,634,668,672,680,686,695,738,748`; `peers-benchmark.tsx:64,71,89,92`; `treasury-chart.tsx:55,70,92,98,158`; `signals-dialog.tsx:87,99,106,117` | **FALLA** |
| `#666666` | 5,74:1 | 5,19:1 | Cuerpo y enlaces (`ficha.tsx:166,323,394,507,571`; `app-shell.tsx:124`) | PASA |
| `#11a8ff` | **2,60:1** | **2,35:1** | Sólo `anticipacion.tsx:52` (fuera de la ficha) | **FALLA** (no aplica a la ficha) |
| `#146c43` (primary real) | 6,45:1 | 5,83:1 | «Ver señales» (`ficha.tsx:310`), chip activo (`chrome.tsx:69,97`), nav activo sobre tinte 15 % = 4,70:1 | PASA |
| `#00a14e` (estado positivo) | **3,38:1** | **3,06:1** | Badge «Positivo» / sub-scores positivos (`chrome.tsx:39`) | **FALLA** a 12–14 px; válido sólo como texto grande (número del gauge) |
| `#e61847` (estado negativo) | 4,58:1 | **4,14:1** | Badge «Negativo» / sub-scores negativos (`chrome.tsx:42`) | PASA por poco en blanco; **FALLA** en cream y en su propio tinte |
| `#00a14e` sobre tinte verde `#ebfbe1` | **3,13:1** | — | Badge positivo real (`statusClass` → `bg-[rgba(215,247,194,.5)]`) | **FALLA** |
| `#e61847` sobre `#fef4f6` | **4,25:1** | — | Badge negativo real (`statusClass`) | **FALLA** |
| `#ef8000` | **2,71:1** | **2,45:1** | Chip de ID en `FichaChips` (`ficha.tsx:147`) — hoy **código muerto**, no renderizado | **FALLA** donde se use |
| `#333333` | 12,63:1 | 11,42:1 | Nav del sidebar (`app-shell.tsx:85,100`) | PASA |
| `#ffffff` sobre `#146c43` | 6,45:1 | — | Botón primario (`contratar-prestamo.tsx:199`), rango activo (`ficha.tsx:570`) | PASA |
| `#ffffff` sobre `#eb002b` | 4,60:1 | — | Banner crítico (`ficha.tsx:92-96`) | PASA |

Conclusión de contraste: **AA incumplido de forma sistemática en los títulos de tarjeta y en los badges de estado** (positivo y negativo), exactamente el compromiso extra de `PRODUCT.md:71` («banda y estado legibles sin color»): el estado es texto, pero el texto no llega a 4,5:1.

---

## Veredicto de jerarquía: ¿trayectoria o foto?

**Foto.** El bloque dominante es `HealthScoreCard` (`compania.tsx:110-113`), y dentro de él el elemento mayor es el número de 40 px del gauge (`score-gauge.tsx:76-82`). La trayectoria aparece en la **tercera** fila (`compania.tsx:136-147`), en una tarjeta titulada «Trayectoria» cuyo chip por defecto dice «3 meses» y cuyo eje no es temporal.

- **Banda: ausente.** `snapshot.band` se calcula (`snapshot.ts:40`) y no se pinta en ninguna parte de la ficha; `FichaGauge` (`ficha.tsx:181-197`) y la variante `embat` del gauge (`score-gauge.tsx:76-82`) ignoran `band`. En un producto «al estilo de una agencia de rating» (`PRODUCT.md:19`), las letras `BBB/BB/B` no existen.
- **Outlook: presente pero secundario** (badge de 12 px en la cabecera de la tarjeta, `ficha.tsx:277-284`), no como titular.
- **Abanico: presente pero ilegible.** Eje X categórico (`score-trajectory.tsx:258-265`, `dataKey="month"` sin `type="number"`); el punto futuro se pega al último histórico (`:197-221`), así que «feb 2027» ocupa el mismo hueco que «jul→ago». En modo `embat` se devuelve sólo el chart (`:389`), sin leyenda p10/p50/p90 ni «Abanico 80 % · 6 meses».
- **Watch: invisible.** `snapshot.watch` viaja en el contrato (`types.ts:102`) y `watchMeta()` existe con label/descripción (`bands.ts:97-106`), pero `snapshot.ts:43-44` lo excluye **explícitamente** de `alerts` y ningún componente lo lee. Un pilar del posicionamiento (`PRODUCT.md:27`) no tiene ni una línea en pantalla.
- **Fecha de los datos: invisible.** `FichaTitle` pintaba «Última actualización» y el mes (`ficha.tsx:111-133`), pero ya no se usa; `snapshot.month` no aparece en el cuerpo.

Resultado: el jurado ve un número grande, cuatro badges y seis tarjetas; lo que hace único al producto (la previsión a seis meses) queda en segundo plano y sin unidades temporales. **No cumple `PRODUCT.md:63`** («banda, outlook y abanico mandan en la jerarquía»).

## ¿Score → porqué → acción en tres minutos?

- **Score:** inmediato (gauge + sub-scores + outlook/trend). Correcto.
- **Porqué:** parcial. `SignalsDialog` (clic en «Ver señales») sí explica cada señal, pero el texto ya redactado (`snapshot.explanation`) nunca se muestra, `ActualizacionesCard` sólo da etiqueta + mes + delta (sin frase, sin dirección), y el rationale de cada acción vive tras un icono de 10 px. El "porqué a un clic" existe; el "porqué en la pantalla" no.
- **Acción:** existe y es legible (`AccionesCard` con descripción, confianza, importe y Δ), pero está **en medio** de la página y la pantalla termina en diagnóstico (`Trayectoria` + `Tesorería`). `PRODUCT.md:67` pide terminar en algo que el gestor pueda hacer hoy; el último píxel es un gráfico.

En tres minutos un jurado entendería el **número** y vería que hay acciones; no entendería por qué cambió ni cuál es el horizonte. El relato score→porqué→acción se puede reconstruir, no se sirve hecho.

## El sidebar cream (`#f6f3ee`): ¿marca o default?

**Default heredado, no movimiento de marca deliberado.** `#f6f3ee` es el «warm cream ground» que `new-work.md:67` describe como uno de los clústeres por defecto de la IA. Ahora bien: aquí el brief **sí** fija la dirección («la temática más nueva del repo, el chrome Embat», `PRODUCT.md:51`), así que no es una derrota del eje libre — es una decisión heredada y legítima dentro de Embat.

El problema es de **propiedad de marca**: el wordmark es «X Ray», `PRODUCT.md:49` dice que Embat no es la marca del producto, y el cream es el fondo del template Embat. Un jurado leído lo leerá como «dashboard cream con acento verde: el default de 2026». Con la personalidad sobrio/preciso/tranquilo, el cream puede defenderse como calma, pero convive con una paleta sin criterio único: primary `#146c43`, estado `#00a14e`, y un `#11a8ff` residual en `anticipacion.tsx:52` mientras `docs/frontend_v0.md:5` sigue diciendo cyan. Eso no es una marca, es un residuo. Mantener el cream exige un porqué escrito y un único acento; si no, X Ray debería tener su propio material/ground.

---

## Priority Issues

### [P0] La banda (rating) no se imprime y el número de hoy sigue mandando

- **Dónde:** `ficha.tsx:254-317` (`HealthScoreCard`), `ficha.tsx:181-197` (`FichaGauge`), `score-gauge.tsx:76-82` (la variante `embat` no pinta `band`), `compania.tsx:110-113` (el gauge es el primer bloque).
- **Qué está mal:** `snapshot.band` se calcula (`snapshot.ts:40`) y se descarta. En pantalla sólo hay un 40 px coloreado por outlook y badges de 12 px. `outlookMeta` sí se usa; `bandMeta` no.
- **Por qué importa (PRODUCT.md):** principio 1 (`:63`) y el vocabulario de rating (`:19`); además el compromiso «banda legible sin color» (`:71`) es hoy incumplible porque la banda no existe.
- **Fix:** renderizar `bandMeta(snapshot.band).label` + outlook como **lead** de `HealthScoreCard` (h1/h2 grande, texto, no sólo color); pasar `band` a `ScoreGauge` y bajar el número a apoyo.
- **Estado en el árbol de trabajo:** el worker concurrente ya pinta «Banda {label} · {outlook}» bajo el gauge (`FichaGauge` recibe `band`), lo que cierra la parte «banda ausente». El número de 40 px sigue siendo el elemento mayor y el outlook va en un badge de 12 px, así que la **inversión de jerarquía** sigue pendiente.

### [P0] El `watch` no se muestra en ningún sitio (regresión respecto a v1)

- **Dónde:** `snapshot.ts:43-44` («watch stays in the JSON but is not surfaced as a banner»), `snapshot.ts:66` (se rellena el campo), `bands.ts:97-106` (`watchMeta` sin consumidores), `ficha.tsx:254-317` (la tarjeta principal ignora `snapshot.watch`).
- **Qué está mal:** la v1 pintaba un banner rojo con el token crudo; la reacción eliminó el watch por completo en vez de calmarlo. De 22 empresas del dataset con watch activo (`COMP_0087`, `COMP_0116`…), ninguna lo ve.
- **Por qué importa (PRODUCT.md):** `watch` es uno de los cuatro términos del posicionamiento (`:27,42`) y el watch es justamente la señal de que el producto **anticipa**; esconderlo mata la ventaja.
- **Fix:** fila inline tranquila en `HealthScoreCard` con `watchMeta(snapshot.watch).label` + `description` y siguiente paso. Sin barra roja salvo DSCR crítico.

### [P0] El abanico a 6 meses es ilegible y arranca en 3 meses

- **Dónde:** `score-trajectory.tsx:258-265` (eje categórico), `:197-221` (punto futuro pegado + áreas p10/p90 sólo entre los dos últimos puntos), `:389` (modo `embat` sin leyenda ni horizonte), `ficha.tsx:533` (`useState<TrajectoryRange>(3)`) y `:555` (`active={range !== 3}`).
- **Qué está mal:** con eje categórico «ago 2026» y «feb 2027» quedan a un hueco; el intervalo del 80 % no se explica; el chip activo por defecto se pinta como inactivo; el horizonte de 6 meses no se declara.
- **Por qué importa (PRODUCT.md):** la posición entera es «ve el deterioro meses antes» (`:27`); un eje que comprime seis meses a un hueco destruye la exactitud que `:66` declara como fuente de confianza.
- **Fix:** eje X temporal real (o insertar meses intermedios como `null`), etiqueta «Abanico 80 % · 6 meses», leyenda p10/p50/p90 (la rama no-embat ya la tiene en `:394-401`), default a 6 y `active` correcto.

### [P0] Contraste AA incumplido en títulos de tarjeta y en los badges de estado

- **Dónde:** `#999` a 14 px en `ficha.tsx:272,351,490,494,548,634,668,738` y subtítulos `:326,399,406,412,672,680,686,695,748`; `peers-benchmark.tsx:64,71,89,92`; `treasury-chart.tsx:55,70,92,98,158`; `signals-dialog.tsx:87,99,106,117`. Badges: `chrome.tsx:37-45` (`#00a14e` 3,13:1; `#e61847` 4,25:1).
- **Qué está mal:** los títulos de cada sección y el estado (Positivo/Negativo) no llegan a 4,5:1. El gauge (40 px) sí pasa por ser texto grande; el resto no.
- **Por qué importa (PRODUCT.md):** `:71` compromete WCAG AA y 4,5:1 con banda/estado legibles sin color. Sam (baja visión) no puede leer por qué tarjeta está mirando ni el estado.
- **Fix:** sustituir el token de título por `#666` (5,74:1) y los textos de estado por tonos oscuros manteniendo los tintes: verde `#00702f`, rojo `#b3123a` (ambos ≥5:1 sobre sus tintes). Un solo cambio en `statusClass`/`scoreBadgeClass`/`signedBadgeClass` y otro en el uso de `#999` como texto.
- **Estado en el árbol de trabajo:** los títulos ya pasan a `#6b6b6b` (≈5,3:1). Los badges de estado (`statusClass`: verde 3,13:1 / rojo 4,25:1) siguen fallando, y la vuelta a `#11a8ff` como primary reintroduce el fallo de controles.

### [P1] El «porqué» ya redactado sigue oculto y el rationale es un icono de 10 px

- **Dónde:** `snapshot.ts:12-35` (`buildScoreExplanation`) y `:84` (`explanation`) no se renderizan; `ActualizacionesCard`/`DriverRow` (`ficha.tsx:319-340`) sólo muestran etiqueta + mes + delta; `RationaleTip` (`ficha.tsx:436-465`, trigger `size-[10px]` en `:442`).
- **Qué está mal:** la API ya devuelve una frase de porqué (`"Índice de salud 43.1 (outlook positive, tendencia flat)…"`) y la UI la tira. El porqué de cada acción es un icono diminuto sin texto.
- **Por qué importa (PRODUCT.md):** principios 2 y 3 (`:64-65`). Obliga a recall y aleja la decisión; el jurado no puede leer score→porqué sin clicar.
- **Fix:** mostrar `snapshot.explanation` (traducida a es-ES puro) bajo el gauge; una línea de porqué por driver; subir el affordance de rationale a ≥24×24 px con etiqueta visible o `aria-label` más texto.

### [P1] El diálogo de señales dice «N en rojo» y no marca ninguna señal en rojo (bug)

- **Dónde:** `compania.tsx:153-157` invoca `<SignalsDialog>` sin la prop `ranks`; `signals-dialog.tsx:69-70` calcula `red = isRedRank(ranks?.[key])` → siempre `false`; el encabezado usa `snapshot.n_red` (`:61`).
- **Qué está mal:** para `COMP_0003` (n_red=2) el diálogo encabeza «4 señales · 2 en rojo» y ninguna tarjeta se tiñe, y la línea de percentil (`p{n}`) desaparece. El dato que da sentido al watch no se ve.
- **Por qué importa (PRODUCT.md):** principio 2 y la exactitud como confianza (`:66`); la UI se contradice a sí misma.
- **Fix:** alimentar `ranks` (los `rank_*` ya existen en el export; `export_web.py:428-433`) o derivar el rojo de `snapshot.signals` y el percentil, de modo que cabecera y tarjetas cuenten lo mismo.

### [P1] La ficha no dice a qué mes corresponden los datos

- **Dónde:** `FichaTitle` (`ficha.tsx:111-133`) define «Última actualización: …» pero **no se usa**; `snapshot.month` no aparece en el cuerpo (`compania.tsx` no lo pinta).
- **Qué está mal:** un producto de trayectoria sin ancla temporal: el jurado no sabe si el 43.1 es de agosto 2026 o de hoy.
- **Por qué importa (PRODUCT.md):** visibilidad de estado (heurístico 1) y exactitud (`:66`).
- **Fix:** renderizar «Datos a {formatMonth(snapshot.month)}» junto a la banda/outlook; o reusar `FichaTitle`.

### [P1] Gráficos sin alternativa accesible y foco invisible

- **Dónde:** `score-trajectory.tsx:253-386`, `dimension-radar.tsx:66-96`, `peers-benchmark.tsx:77-124`, `treasury-chart.tsx:79-155` (SVG recharts sin `role="img"`/`aria-label`/`<title>` ni tabla equivalente); `RationaleTip` trigger `outline-none` (`ficha.tsx:442`); `ConfidenceMeter` trigger `outline-none` (`ficha.tsx:220`).
- **Qué está mal:** Sam no percibe el abanico, el radar ni el benchmark; y los dos disparadores de popover no muestran foco.
- **Por qué importa (PRODUCT.md):** AA y «toda la consola navegable con teclado» (`:71`); heurísticos 6 y 9.
- **Fix:** `role="img"` + `aria-label` con resumen textual (p.ej. «Caja p10 −4,7 M€ / p50 0,4 M€ / p90 5,7 M€ a 6 meses») en cada chart y `focus-visible:ring`/`outline` en los dos disparadores.
- **Estado en el árbol de trabajo:** `embatFocusRing` ya se añade a `ConfidenceMeter`, `RationaleTip`, «Ver señales» y enlaces de acción; queda pendiente el `aria-label` de los cuatro charts.

### [P1] La pantalla no termina en una acción

- **Dónde:** `compania.tsx:124-147`: `AccionesCard` va en medio; el último bloque es `TrajectoryCard` + `TreasuryChartCard`.
- **Qué está mal:** el píxel final es diagnóstico. Salvo que exista `deal`, no hay un «haz esto hoy».
- **Por qué importa (PRODUCT.md):** principio 5 (`:67`).
- **Fix:** mover `AccionesCard` al final o fijar una CTA persistente («Ver acciones de financiación») que cierre la página.

### [P1] Cuatro cantidades 0–100 sin jerarquía ni unidad

- **Dónde:** gauge (`ficha.tsx:294-296`), cinco sub-scores (`:297-305`), media de vecinos (`peers-benchmark.tsx:100-107`), uplift con encabezado `Δ` (`ficha.tsx:498`) y `formatCompactEuro` (`:415`).
- **Qué está mal:** el «Δ» no declara unidad; el importe de acción hardcodea euros; la oferta sí explica «what-if» (`ficha.tsx:748-751`) pero el resto no. Persiste el riesgo de `PRODUCT.md:40` (dos 0–100 distintos).
- **Por qué importa (PRODUCT.md):** `:40` y heurístico 8; cuatro números compitiendo diluyen el titular.
- **Fix:** renombrar `Δ` a «Uplift (pts)» y repetir el aviso what-if; usar `formatCurrency(currency)` en importes; plegar los sub-scores o darles una escala explícita.

### [P2] Código muerto y skeleton desalineado

- `FichaTitle` (`ficha.tsx:111`), `FichaChips` (`:135`), `DimensionsFichaCard` (`:621`) y `PeersFichaCard` (`:646`) no se importan en ningún sitio. `FichaSkeleton` (`:595-619`) dibuja alturas/anchuras del diseño antiguo (`h-[266px] w-[428px]`, `:608`) frente a las tarjetas reales de 300px → salto de layout. **Fix:** eliminar o cablear; alinear el skeleton con `min-h-[300px]`.

### [P2] Los pares se rotulan con `company_id` crudo

- `peers-benchmark.tsx:85-92` usa `dataKey="id"` (tick `#999` a 10 px) y los chips (`:127-135`) muestran `COMP_0218` en vez del nombre, aunque `data` ya trae `name` (`:36-47`). Para un CFO, `COMP_0218` no significa nada. **Fix:** usar `name`, ticks ≥11 px y `#666`.

### [P2] La moneda no-EUR se fuerza a euros en acciones y simulación

- `ficha.tsx:415` y `treasury-chart.tsx:63,66` usan `formatCompactEuro` (hardcodea `k€/M€`, `format.ts:40-46`) pese a que `compania.tsx:61` ya resuelve `currency`. `PeersFichaCard` sí la enhebra, pero está muerto. **Fix:** pasar `currency` a `ActionRow` y a la cabecera de tesorería y usar `formatCurrency`.

### [P2] El banner crítico no ofrece siguiente paso

- `ficha.tsx:88-98`: «Aviso: …» en barra roja sin acción ni enlace, aunque ya es sólo DSCR (buena decisión respecto a v1). **Fix:** añadir el siguiente paso («ver acciones» / «refinanciar») dentro del aviso.

### [P2] `driverIsGood` pinta dots de trayectoria al revés para señales de polaridad alta

- `score-trajectory.tsx:141-143,352-376` usa `driverIsGood(signal, delta)`, pero `driver.delta` ya viene en **puntos de score** (positivo = bueno; `explain.py:64`, `export_web.py:398`). Para `overdue_flow_rate_3m +0.87` el badge del driver sale verde (`ficha.tsx:333`) y el dot/popover dice «Mala» (rojo). **Fix:** usar el signo en `score-trajectory` igual que `signedBadgeClass`, o exponer la dirección ya resuelta.

### [P2] `ScoreUplift` conserva `font-mono` como disfraz

- `score-uplift.tsx:21` usa `font-mono` para un dato no-mono; `craft-floor.md:38` lo censura como disfraz «técnico». **Fix:** `tabular-nums` con Inter.

### [P2] Rango de trayectoria por defecto en 3 y chip que parece inactivo

- `ficha.tsx:533` (`useState(3)`) y `:555` (`active={range !== 3}`). Contradice «trayectoria» y confunde. **Fix:** default 6; activo siempre que haya valor.

### [P2] Copy y paleta sin criterio único

- `Health Score` (`ficha.tsx:275`), `Benchmarking` (`peers-benchmark.tsx:66`), `Δ`/`Conf.` (`ficha.tsx:496-498`), `fan 6m p50` (`treasury-chart.tsx:66`) en una UI es-ES. Y tres verdes/azules conviviendo (`#146c43`, `#00a14e`, `#11a8ff` residual) mientras `docs/frontend_v0.md:5` documenta cyan. **Fix:** traducción es-ES de etiquetas y un único acento documentado.

---

## Persona Red Flags

**«Marta», gestora financiera de pyme (persona de proyecto):** aterriza en un nav de cartera que no gestiona (`app-shell.tsx:28-33`); ve un Health Score con un 40 grande y **sin banda** ni fecha; el `watch` de su empresa (si lo tiene) no aparece; para ver si empeora tiene que llegar a la tercera fila, abrir un chip que dice «3 meses» y aceptar que el abanico de 6 meses no tiene leyenda; la página termina en un gráfico de tesorería, no en qué hacer.

**Sam (teclado, baja visión):** los títulos de tarjeta y los badges de estado no llegan a 4,5:1 (`#999` 2,85:1; `#00a14e` 3,13:1; `#e61847` 4,25:1); el radar y los tres charts son SVG sin `aria-label`; el rationale es 10×10 px y el popover de confianza anula el foco (`outline-none`); el rango de trayectoria exige abrir un popover sin atajo.

**Jordan (primerizo ≈ jurado):** «Health Score», «Benchmarking», «DSCR», `Δ`, `fan 6m p50` sin definir en pantalla; el abanico sombreado no se explica; no hay ninguna ayuda de ruta; la banda no aparece, así que no puede situar el 43,1 en ninguna escala.

**Alex (power user):** sin atajos ni export; cada acción son 3 enlaces con 2 no tabulables (`ficha.tsx:409-431`); el rango 3→12 exige popover + clic; no hay copia del snapshot.

---

## Minor Observations

- `page.tsx:57` usa el literal `text-muted-foreground` en el fallback de `Suspense`, no el token Embat `#666`; el fallback se asoma antes del skeleton.
- `FichaSkeleton` (`ficha.tsx:606-616`) siempre dibuja 3 tarjetas en la primera fila aunque `PeersBenchmarkCard` sólo exista si `peers.k > 0`.
- `ActualizacionesCard` es fija `h-[300px]` con `overflow-auto`: con 6 drivers (`export_web.py:403` limita a 6) habrá scroll interno en tarjetas de 300px.
- `ConfidenceMeter` calcula `hint` con `monthsOfHistory`, pero `HealthScoreCard` no se lo pasa (`ficha.tsx:288-291`), así que el popover sólo muestra «N señales».
- El número del gauge es `Math.round(score)` (`score-gauge.tsx:81`) mientras la API da un decimal: 43,1 se lee «43».
- `treasury-chart.tsx:157-161` avisa «la simulación MPC solo cubre EUR» — valioso, pero el importe de arriba ya se muestra en euros sin esa cautela.

---

## Deterministic scan

- `impeccable detect --json web/components/embat` → `[]`, exit 0. Sobre `.tsx` el detector v4 usa regex: no ve contraste, jerarquía, IA, copy ni estados. Limpio mecánicamente ≠ bien diseñado; los hallazgos de arriba son de revisión, no del detector.
- Navegador: no disponible. `GET /c/COMP_0218` servido (HTTP 200) y `GET /api/xray/score/*` inspeccionados; el cuerpo cliente no es observable por SSR y no hubo overlay.

---

## Preguntas

1. Si el producto es «Trayectoria, no foto» (`PRODUCT.md:27`), ¿por qué la ficha abre con una tarjeta *hero-metric* y no con **banda + outlook + watch + abanico** como titular, con el número como pie?
2. El `watch` es la señal de que el modelo *anticipa*: ¿cómo debería leerse en la ficha para sumar confianza («lo veíamos venir») sin volver a una alarma roja?
3. El fondo cream es el default cálido que cualquiera acierta; `PRODUCT.md:49` dice que Embat no es la marca. ¿Qué elemento material —si alguno— haría que la superficie se reconociera como **X Ray** y no como el template Embat?
