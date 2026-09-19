# Critique — ficha de compañía `/c/[companyId]`

`Method: dual-agent (A: explore/design-review · B: explore/detector)`
`Nota de método: el padre ya conocía el resultado vacío del detector antes de lanzar A (violación de orden, no de aislamiento). B no vio la salida de A. Revisión solo de código: no hubo dev server en http://localhost:3000 (conexión rechazada, nada escuchando en el puerto), así que no hubo inspección visual ni overlay. Superficie juzgada en el working tree; otro worker edita `web/components/embat/` en paralelo, así que las líneas de esos ficheros pueden desplazarse.`

Modelo del revisor: `helm/deepseek-v4-flash` (`opencode.json` raíz).

Target resuelto: `web/app/c/[companyId]/page.tsx` + `web/components/embat/{compania,ficha,chrome,font,anticipacion}.tsx` + los `components/xray/*` que la ficha embebe.

---

## Design Health Score

| # | Heurística | Score | Problema clave |
|---|-----------|-------|----------------|
| 1 | Visibility of System Status | 2 | Hay skeleton y "Última actualización", pero el abanico no tiene leyenda ni horizonte y `watch` se pinta como el token crudo "Watch" sin el motivo (`compania.tsx:41,87-91`). |
| 2 | Match System / Real World | 2 | Mezcla ES/EN: "Bankability"/"Business" (`ficha.tsx:219-220`), señales snake_case (`ficha.tsx:230`), banner "Warning - …" (`ficha.tsx:93`). |
| 3 | User Control and Freedom | 3 | Navegación y popovers dan salida; el rango de trayectoria vive en un chip poco obvio y no hay vuelta in-page a "Compañías". |
| 4 | Consistency and Standards | 2 | Dos vocabularios de badge (chip Embat vs píldora shadcn), y "Puntuación" significa Health Score en unas vistas y uplift en la ficha; umbrales 60/40 (`chrome.tsx:33-37`) ≠ bandas (`bands.ts:14-24`). |
| 5 | Error Prevention | 3 | Pocas acciones destructivas; el import va en diálogo; cerrar oferta oculta acciones (`compania.tsx:108-116`). |
| 6 | Recognition Rather Than Recall | 2 | Motivo del watch oculto, abanico sin explicar, rationale tras icono de 10px (`ficha.tsx:340`), y la explicación que ya existe (`snapshot.ts:11-38`) no se muestra. |
| 7 | Flexibility and Efficiency | 2 | Sin atajos; cada fila de acción son 3 `<Link>` con 2 `tabIndex={-1}` (`ficha.tsx:309-329`). |
| 8 | Aesthetic and Minimalist Design | 2 | Ocho tarjetas casi iguales, alturas fijas irregulares, cuatro números 0–100 compitiendo; el héroe no es el héroe del producto. |
| 9 | Error Recovery | 2 | Error visible (`compania.tsx:72-75`) pero sin reintento ni siguiente paso. |
| 10 | Help and Documentation | 1 | Ninguna ayuda en la ruta; `outlookMeta().description` y `buildScoreExplanation()` existen y no se usan; DSCR/Bankability/watch sin definir. |
| **Total** | | **21/40** | **Acceptable (52,5 %)** |

Puntúa 21, no 24: los dos assessments discreparon en Visibility (2 vs 3), Aesthetic (2 vs 3) y Help (1 vs 2); la síntesis toma el valor más duro porque el abanico sin leyenda, las ocho tarjetas y la ausencia total de ayuda son reales. **Calma visual buena; verdad de producto pobre.**

---

## Design Specificity Verdict

**Medio-autorado.** El chrome de Embat sí es específico y coherente; la jerarquía, la IA y el etiquetado de los dos scores son patrones de dashboard intercambiables que pelean contra el posicionamiento.

**Lo que sí es de este producto**
- Sistema tipográfico real: Inter Variable / Inter Display, radius 4px, `#11a8ff`, bordes `#dce0e6`, grises `#666/#999`, centralizados (`font.ts:1-29`, `globals.css:154-177`).
- Conjunto propio de micro-componentes: `EmbatButton`, `FilterChip`, `statusClass`, `DemoChip` (`chrome.tsx:140-163,58-93,17-37,45-56`) y tarjeta `fichaCardClass` reutilizada (`ficha.tsx:48-50`).
- Skeleton con la geometría final (`ficha.tsx:486-510`) y `aria-labelledby` en cada tarjeta (`ficha.tsx:207-210,250-253,381-384`): mejor estructura semántica que la media.

**Dónde se cuela el anti-referente `components/xray/*`**
- `DimensionRadar` no tiene variante Embat: usa `var(--border)`/`var(--muted-foreground)` y ejes recharts genéricos, sin leyenda ni escala (`dimension-radar.tsx:66-96`).
- `ScoreUplift` mantiene `font-mono text-sm` (`score-uplift.tsx:23`) y `ScoreBandBadge` es una píldora shadcn `rounded-4xl` (`badge.tsx:7`), redonda frente al chip Embat de 4px; `bandToneClass` mapea a `--chart-*`, tokens que `.embat-ui` no redefine (`bands.ts:38-51`).
- `ScoreGauge variant="embat"` es un bolt-on: solo cambia caja, fondo y número; ignora `label`, `band` y `reasoning` (`score-gauge.tsx:76-82`).

**Fallo de especificidad mayor:** el shell del "mi CFO" es la consola de cartera heredada. Nav `Grupos Empresariales / Compañías / Ajustes` (`app-shell.tsx:22-25`), cuando `PRODUCT.md:13` dice que el asesor ya no es usuario. No hay grupo de rutas `(embat)`; la ficha se ensambla sobre el shell xray antiguo.

---

## Overall Impression

Es un dashboard financiero calmado y limpio que, en su primer pantallazo, dice lo contrario de lo que vende: pone el número de hoy en 428×266 arriba a la izquierda, **no imprime la banda en ningún sitio**, y deja el abanico a seis meses en la segunda fila dentro de una tarjeta que por defecto muestra 3 meses. La mayor oportunidad no es pulir tarjetas: es **invertir la jerarquía** — banda + outlook + watch como titular, gauge como apoyo — y hacer legible el abanico. Con eso el jurado entiende el score en tres minutos.

---

## What's Working

1. **Un micro-chrome unificado de verdad.** `EmbatButton`/`FilterChip`/`statusClass` comparten radio, escala y color (`chrome.tsx:17-163`); no es pintura por encima.
2. **Datos deterministas y bien acotados.** Todo sale del `ScoreSnapshot`; el uplift se calcula con `publishedProjection` (`ficha.tsx:289`) y `DealFichaCard` incluso avisa "Impacto what-if (no recalcula el Health Score oficial)" (`ficha.tsx:639-641`). Nada inventado.
3. **Skeleton y `role="alert"`.** El loading respeta la geometría (`ficha.tsx:486-510`) y el banner usa `role="alert"` (`ficha.tsx:88`); el compromiso "el score es pronóstico de persistencia, no probabilidad de impago" está escrito (`anticipacion.tsx:105`).

---

## Contrast checks (ratios reales WCAG, calculados)

Texto normal (<18,66px bold / <24px) exige **4,5:1**.

| Par | Ratio | Veredicto | Dónde |
|---|---|---|---|
| `#999999` sobre `#ffffff` | **2,85:1** | FALLA | Títulos de tarjeta y columnas (`ficha.tsx:214,257,388,440,525,559`), fechas y subtítulos (`ficha.tsx:232,302`), importe (`ficha.tsx:312`), `PeerTile` (`ficha.tsx:604`) |
| `#666666` sobre `#ffffff` | **5,74:1** | PASA | Texto de cuerpo (`ficha.tsx:229,297,634`) |
| `#11a8ff` sobre `#ffffff` | **2,60:1** | FALLA | Chip "Última actualización" (`ficha.tsx:124`), nav activo (`app-shell.tsx:68`), `FilterChip` activo (`chrome.tsx:75`) |
| `#ffffff` sobre `#11a8ff` | **2,60:1** | FALLA | `EmbatButton` primary (`chrome.tsx:153`), "Buscar" (`chrome.tsx:124`), rango activo (`ficha.tsx:462`) |
| `#11a8ff` sobre tinte azul 12 % | **2,32:1** | FALLA | Nav activo (`app-shell.tsx:68`) |
| `#11a8ff` sobre tinte azul 5 % | **2,49:1** | FALLA | Chips "Demo"/fecha (`chrome.tsx:49`, `ficha.tsx:124`) |
| `#00a14e` sobre `#ffffff` | **3,38:1** | FALLA | "Estado: Positivo" (`chrome.tsx:19`) |
| `#00a14e` sobre tinte verde 50 % | **3,13:1** | FALLA | "Estado: Positivo" (`chrome.tsx:19`) |
| `#e61847` sobre `#ffffff` | **4,58:1** | PASA por poco | "Estado: Negativo" (`chrome.tsx:22`) |
| `#e61847` sobre `#fef4f6` | **4,25:1** | FALLA por poco | "Estado: Negativo" / Watch (`chrome.tsx:22`, `compania.tsx:88`) |
| `#ef8000` sobre `#ffffff` | **2,71:1** | FALLA | Chip del ID de compañía (`ficha.tsx:144`) |
| `#ef8000` sobre tinte naranja 5 % | **2,58:1** | FALLA | Chip del ID (`ficha.tsx:144`) |
| `#eb002b` sobre `#ffffff` | **4,60:1** | PASA | Banner (`ficha.tsx:89`) |
| `#ffffff` sobre `#eb002b` | **4,60:1** | PASA | Texto del banner (`ficha.tsx:91`) |

El compromiso extra "banda y estado legibles sin color" se cumple a medias: el estado es texto ("Estado: Negativo"), pero **la banda no existe**, y el propio texto de estado no alcanza AA. `scoreBadgeClass` (`chrome.tsx:33-37`) codifica bien/regular/mal **solo por color** para Bankability/Business, sin etiqueta.

---

## Priority Issues

### [P0] La banda no se imprime en ninguna parte y el gauge manda
- **Dónde:** `score-gauge.tsx:76-82` (la variante `embat` ignora `band` y `label`), `ficha.tsx:160-179` (se pasa `band` pero no se pinta), `compania.tsx:95-99` (el gauge es el primer bloque, 428×266).
- **Qué está mal:** el producto se llama rating y su posicionamiento es "banda, outlook, watch, abanico"; en pantalla solo hay un número grande 40px coloreado por outlook y un chip "Estado: <label>". `AAA/BB/CCC` no aparecen. `ScoreSnapshot.band` se calcula (`bands.ts:26-32`) y se descarta.
- **Por qué importa (PRODUCT.md):** principio 1 (banda/outlook/abanico mandan; el número de hoy no es el titular) y el compromiso de accesibilidad "banda y estado legibles sin color". Además, `scoreBadgeClass` usa umbrales 60/40 que no coinciden con los cortes de banda.
- **Fix:** en la variante `embat` de `ScoreGauge`, renderizar `band` + `outlook` (p. ej. "BB · Estable") junto al número y sobre él; subir banda/outlook/watch a `h1` de la ficha y bajar el gauge a tile de apoyo.

### [P0] El abanico a 6 meses se dibuja como si fuera un mes
- **Dónde:** `score-trajectory.tsx:135-157` (se añade el punto futuro pegado al último mes histórico) y `:194-201` (eje X categórico, `dataKey="month"` sin `type="number"`). Sin leyenda en modo embat (`:255`). Rango por defecto 3 meses (`ficha.tsx:428`).
- **Qué está mal:** con eje categórico, "ago 2026" y "feb 2027" ocupan el mismo hueco horizontal que "jul→ago"; un CFO lee el abanico como "el mes que viene". El 80 % de cobertura (p10/p90) no se explica en ningún sitio.
- **Por qué importa (PRODUCT.md):** la posición entera es "ve el deterioro meses antes"; un eje que falsea el tiempo destruye la exactitud que `PRODUCT.md:66` declara como fuente de confianza.
- **Fix:** eje X temporal real (o insertar los meses intermedios como null), etiqueta "Abanico 80 % · 6 meses" y leyenda p10/p50/p90 (la rama no-embat ya la tiene, `score-trajectory.tsx:260-267`); default a 6 meses.

### [P0] Contraste AA incumplido en el texto de estado y en los controles primarios
- **Dónde:** ver tabla. `#999999` 2,85:1 (`ficha.tsx:214,440,525,604`), `#11a8ff` 2,60:1 (chips y nav), `#ffffff` sobre `#11a8ff` 2,60:1 (`chrome.tsx:153`), `#00a14e` 3,13-3,38:1 (`chrome.tsx:19`), `#ef8000` 2,58-2,71:1 (`ficha.tsx:144`), `#e61847` sobre rosa 4,25:1.
- **Qué está mal:** los estados, el ID de compañía, la fecha de actualización y los botones primarios no cumplen 4,5:1. El chip de rationale es 10×10px (`ficha.tsx:340`).
- **Por qué importa (PRODUCT.md):** `PRODUCT.md:71` compromete WCAG AA y 4,5:1, con banda/estado legibles sin color. Sam (baja visión) no puede leer el estado.
- **Fix:** tokens de texto más oscuros manteniendo los tintes (`#0b6fb3` azul, `#00702f` verde, `#b45309` naranja, `#b3123a` rojo), y objetivo ≥24×24px para el icono de rationale.

### [P1] "Puntuación" son dos números 0–100 distintos, y el gauge no dice qué es
- **Dónde:** `ficha.tsx:392-396` (cabecera "Tipo / Importe / Puntuación"), `ficha.tsx:307,327` (el valor es `publishedProjection().uplift`, puntos de what-if), frente a `ficha.tsx:172-184` (Health Score sin etiqueta).
- **Por qué importa (PRODUCT.md):** `PRODUCT.md:40` prohíbe presentarlos como el mismo score. La gestora puede leer "Puntuación +2,3" como que su score subió 2,3 puntos.
- **Fix:** renombrar a "Uplift (pts)", usar `formatDelta` con sufijo y repetir el aviso what-if que ya existe en `ficha.tsx:639-641`; etiquetar el gauge "Health Score".

### [P1] El banner grita, muestra un token crudo y en inglés
- **Dónde:** `snapshot.ts:52-59` (todo `watch` se empuja como `severity:"warning"` y `message: row.watch`, p. ej. `large_maturity`), `ficha.tsx:54-60,86-96` (banner full-bleed `#eb002b`, texto `Warning - {message}`).
- **Por qué importa (PRODUCT.md):** `PRODUCT.md:66` prohíbe la "alarma teatral". Un watch —señal de que el producto *anticipa*— se pinta igual que una brecha de DSCR, y el mensaje sale como `Warning - large_maturity`, snake_case inglés en UI es-ES (`PRODUCT.md:34`). `watchMeta().label/description` (`bands.ts:97-106`) ya existen y no se usan.
- **Fix:** alert inline y tranquilo dentro de la columna, con la etiqueta de `watchMeta()` y el siguiente paso; reservar la barra roja para crítico DSCR y escribirlo en español.

### [P1] Jerga inglesa y señales crudas en el "porqué"
- **Dónde:** `ficha.tsx:219-220` ("Bankability"/"Business"), `ficha.tsx:230` (`{driver.signal}` = `cash_buffer_days`, `overdue_flow_rate_3m`, `net_cash_flow_ratio_3m`, `dscr_6m`), `compania.tsx:87-91` (chip "Watch" sin motivo).
- **Por qué importa (PRODUCT.md):** usuario = gestor financiero, no analista ("lee un score y una tendencia, no una tabla de features", `PRODUCT.md:11`). Heurística 2 y principio 2 ("cada cifra tiene su porqué a un clic").
- **Fix:** diccionario de etiquetas es-ES para las cuatro señales (`cash_buffer_days` → "Días de caja") y para los sub-scores ("Financiabilidad"/"Actividad"); mostrar `watchMeta().label` en el chip.

### [P1] El "porqué" ya escrito no se muestra, y el rationale vive en un icono de 10px
- **Dónde:** `snapshot.ts:11-38` (`buildScoreExplanation`, `snapshot.explanation`), nunca renderizado en la ficha; `snapshot.ts` exporta `driver_detail` (`value`, `rank`) que no se usa. El único porqué está tras `RationaleTip` de 10px (`ficha.tsx:334-363`).
- **Por qué importa (PRODUCT.md):** principio 2 y 3 (score → porqué → acción en tres minutos). Ocultar la explicación fuerza recall y aleja la decisión.
- **Fix:** pasar `reasoning`/`explanation` al `ScoreGauge` (la prop ya existe, `score-gauge.tsx:26`) y mostrar una línea de porqué por driver.

### [P1] Gráficos sin alternativa accesible y foco eliminado
- **Dónde:** `dimension-radar.tsx:66-96` y `score-trajectory.tsx:189-253` (SVG recharts sin `role="img"`/`aria-label`/`<title>` ni tabla equivalente); `outline-none` sin `focus-visible` en `FilterChip` (`chrome.tsx:74`), `RationaleTip` (`ficha.tsx:340`) y `EmbatButton` (`chrome.tsx:152`).
- **Por qué importa (PRODUCT.md):** AA y "toda la consola navegable con teclado". Sam no percibe el abanico ni el radar y no ve dónde está el foco.
- **Fix:** `role="img"` + `aria-label` con el resumen textual en ambos charts y `focus-visible:ring` en los tres controles.

### [P1] La pantalla no termina en una acción
- **Dónde:** `compania.tsx:106-131`: fila 2 = Acciones + Trayectoria; fila 3 = Dimensiones / Comparables / Oferta aceptada. El último píxel es diagnóstico, salvo que exista deal.
- **Por qué importa (PRODUCT.md):** principio 5, "toda pantalla termina en algo que el gestor puede hacer hoy".
- **Fix:** mover Acciones al final o fijarla como columna/CTA persistente; cerrar con el siguiente paso.

### [P1] Dos descomposiciones del score y umbrales incoherentes
- **Dónde:** `DesgloseCard` con Bankability/Business (`ficha.tsx:199-223`) usa `scoreBadgeClass` 60/40 (`chrome.tsx:33-37`); `DimensionsFichaCard` con 5 dimensiones sin escala (`ficha.tsx:512-535`, `dimension-radar.tsx:58-64`); las bandas cortan en 68/55 (`bands.ts:14-24`).
- **Por qué importa (PRODUCT.md):** principio 1 y 3; tres particiones del mismo score sin relación explícita generan carga cognitiva y desconfianza.
- **Fix:** unificar en una sola descomposición (las 4 señales del discurso, o las 5 dimensiones) y alinear los cortes con las bandas.

### [P1] `trend`, `confidence` y `peer_percentile` existen y no se muestran
- **Dónde:** `types.ts:84-103` (campos del contrato), `snapshot.ts:69-86` (se rellenan), `compania.tsx` no los usa. En el dataset de ejemplo `trend = "flat"`.
- **Por qué importa (PRODUCT.md):** vocabulario de producto: trend forma parte de la trayectoria que se vende.
- **Fix:** mostrar el trend junto a banda/outlook ("Tendencia: estable") y la confianza como matiz del abanico.

### [P2] Alturas y bordes irregulares
- `FichaGauge` mide 266px y no tiene borde ni sombra, mientras sus vecinas miden 300px y sí los tienen (`ficha.tsx:170,208,251`); en `flex-wrap` produce filas dentadas y scroll interno (`ficha.tsx:254,385`). PRODUCT pide calma y precisión. **Fix:** unificar alto de fila y dar al gauge el mismo `fichaCardClass`.

### [P2] El chip del ID de compañía es un identificador interno en naranja
- `ficha.tsx:144-146` pinta el `companyId` crudo (p. ej. `COMP_0001`) como chip destacado. Para un CFO no significa nada y además falla contraste. **Fix:** eliminar o cambiar por CIF/NIF o nombre corto.

### [P2] Las acciones fuerzan euros en empresas no-EUR
- `ficha.tsx:314` usa `formatCompactEuro`, que hardcodea `k€/M€` (`format.ts:40-46`), mientras `PeersFichaCard` sí enhebra `currency` (`ficha.tsx:568-590`). `PRODUCT.md:34` dice que las 137 no-EUR muestran su moneda. **Fix:** pasar `company.currency` (`compania.tsx:39`) a `ActionRow` y usar `formatCurrency`.

### [P2] Estado de error sin salida
- `compania.tsx:72-75`: mensaje genérico, sin reintento ni enlace alternativo. **Fix:** botón "Reintentar" y enlace a `/companies`.

### [P2] El rango de trayectoria arranca en 3 meses y parece inactivo
- `ficha.tsx:428` (default `3`) y `ficha.tsx:444-447` (`active={range !== 3}`), así que el valor vigente se pinta como no seleccionado. Contradice "trayectoria" y confunde. **Fix:** default 6 y marcar el chip siempre como activo cuando hay valor.

### [P2] Restos de shadcn en el score
- `score-uplift.tsx:23` (`font-mono text-sm`), `badge.tsx:7` (`rounded-4xl` en `ScoreBandBadge`) y `bands.ts:38-51` (`--chart-*` que `.embat-ui` no redefine). **Fix:** migrar `ScoreBandBadge`/`ScoreUplift` a la píldora Embat de 4px y a tokens embat.

### [P2] Nav de consola de asesor como shell del gestor
- `app-shell.tsx:22-25` ofrece `Grupos Empresariales / Compañías / Ajustes`; `PRODUCT.md:13` declara ese vocabulario heredado. **Fix:** nav de una sola compañía (resumen, acciones, financiación) mientras la decisión de plataforma siga abierta.

---

## Persona Red Flags

**"Marta", gestora financiera de pyme (persona de proyecto):** aterriza en un nav de cartera que no gestiona (`app-shell.tsx:22-25`); la recibe un banner rojo "Warning - large_maturity" (`ficha.tsx:88-94`, `snapshot.ts:53-58`); ve un 40 grande rojo sin banda, "Bankability"/"Business" y una columna "Puntuación +2,3" que no es su score; el abanico a 6 meses que vino a ver está en fila 2, sin leyenda y con chip "3 meses" (`ficha.tsx:428,474-481`); la página acaba en "Dimensiones"/"Comparables" sin un "haz esto hoy".

**Sam (accesibilidad, teclado, baja visión):** estados y acentos por debajo de 4,5:1 (`chrome.tsx:19-24`, `ficha.tsx:124,144`); radar y trayectoria son SVG recharts sin `aria-label` ni tabla; el icono de rationale es 10×10px (`ficha.tsx:340`); `outline-none` deja el foco invisible en `FilterChip`/`RationaleTip`/`EmbatButton` (`chrome.tsx:74,152`, `ficha.tsx:340`); el banner `role="alert"` interrumpe al lector en cada carga antes de dar contexto.

**Jordan (primerizo, ≈ jurado):** "Watch" sin explicación (`compania.tsx:87-91`) pese a que `watchMeta()` tiene label y descripción; "Bankability"/"Business" y `dscr_6m` sin definir; el abanico sombreado no se explica; ninguna ayuda en la ruta.

**Alex (power user):** cambiar 3→12 meses exige abrir popover y clicar cada vez (`ficha.tsx:449-471`), sin atajo ni preferencia persistida; cada fila de acción son 3 enlaces con 2 no tabulables (`ficha.tsx:309-329`); sin exportar/copiar el snapshot.

---

## Minor Observations

- El fallback de `Suspense` hardcodea `text-[#666]` en vez del token Embat y parpadea antes del skeleton (`page.tsx:35`).
- `formatSlashDateFromMonth` rotula el fin de mes (`format.ts:49-54`) mientras la historia/abanico se ancla en el mes-categoría: doble ancla temporal sutil.
- `ScoreUplift` resalta solo lo negativo (`score-uplift.tsx:24`): un what-if positivo queda desenfatizado.
- `anticipacion.tsx` es la pieza más alineada con PRODUCT (aviso "no son probabilidades de impago", `:105`) y no aparece en la ficha: podría enlazarse desde el gauge.
- El escaneo ampliado a todo `web` detectó 3 avisos `overused-font` (Inter) en `globals.css:174,188,193`: son contexto, no hallazgos del target; Inter es la fuente de marca y la regla es juicio de gusto.

---

## Deterministic scan (Assessment B)

- `impeccable detect --json web/components/embat` → `[]`, exit 0.
- `impeccable detect --json web/components/xray` → `[]`, exit 0.
- `impeccable detect --json web/app/c` → `[]`, exit 0.
- Verificado que no es un falso negativo: `--no-config` y `--scope` siguen devolviendo `[]`, y un control positivo sobre `web` sí emite 3 avisos `overused-font` (fuera de las carpetas del target). Detector v4.0.0; sobre `.tsx` usa regex, así que no ve contraste, jerarquía, IA, copy ni estados. Limpio mecánicamente ≠ bien diseñado.
- Navegador: `http://localhost:3000` rechazó conexión (`/` y `/companies`), `netstat :3000` sin listener. Inspección visual **no realizada**; sin overlay. Se revisó solo por código.

---

## Preguntas

1. Si el producto es "Trayectoria, no foto", ¿por qué el elemento más grande es el número de hoy, y hace falta un gauge de 428px — o deberían **banda + outlook + watch** ser el `h1` con el número como pie?
2. Hay cuatro cantidades 0–100 (Health Score, Bankability, Business, uplift). ¿Dónde dice la interfaz cuál es la oficial?
3. Un watch es una señal de que el modelo *anticipa*; ¿cómo sería un watch que se lea como "lo hemos visto antes" y no como pánico?
