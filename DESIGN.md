---
name: X Ray
description: "Sistema visual del score de financiabilidad de pyme, sobre el chrome Embat: tema claro, Inter, tarjetas planas y un único acento verde."
colors:
  primary-green: "#146c43"
  surface-white: "#ffffff"
  surface-muted: "#f5f6f8"
  sidebar-cream: "#f6f3ee"
  border-cool: "#dce0e6"
  ink: "#000000"
  ink-secondary: "#666666"
  ink-tertiary: "#6b6b6b"
  ink-nav: "#333"
  status-positive: "#00a14e"
  status-positive-surface: "rgba(215,247,194,0.5)"
  status-positive-border: "rgba(166,235,132,0.7)"
  status-negative: "#e61847"
  status-negative-surface: "#fef4f6"
  status-negative-border: "#fbd3dc"
  status-warning: "#ef8000"
  status-alert: "#eb002b"
  fee-violet: "#6d28d9"
  fee-violet-surface: "rgba(163,75,203,0.1)"
typography:
  display:
    fontFamily: "Inter Display, Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    letterSpacing: "-0.3px"
  headline:
    fontFamily: "Inter Variable, var(--font-inter-variable), ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    letterSpacing: "-0.28px"
  title:
    fontFamily: "Inter Variable, var(--font-inter-variable), ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    letterSpacing: "-0.15px"
  body:
    fontFamily: "Inter Variable, var(--font-inter-variable), ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    letterSpacing: "-0.14px"
  body-sm:
    fontFamily: "Inter Variable, var(--font-inter-variable), ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    letterSpacing: "-0.13px"
  label:
    fontFamily: "Inter Variable, var(--font-inter-variable), ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "-0.12px"
rounded:
  sm: "9.6px"
  md: "12.8px"
  lg: "16px"
  xl: "22.4px"
  2xl: "28.8px"
  3xl: "35.2px"
  4xl: "41.6px"
spacing:
  xs: "5px"
  sm: "10px"
  md: "15px"
  lg: "20px"
  xl: "30px"
  gutter: "50px"
  gutter-mobile: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-green}"
    textColor: "{colors.surface-white}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "0 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "0 12px"
  chip-filter:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xl}"
    height: "32px"
    padding: "0 12px"
  chip-status-positive:
    backgroundColor: "{colors.status-positive-surface}"
    textColor: "{colors.status-positive}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 4px"
  chip-status-stable:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 4px"
  chip-status-negative:
    backgroundColor: "{colors.status-negative-surface}"
    textColor: "{colors.status-negative}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 4px"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "15px"
  tile:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "8px 10px"
  table-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    height: "48px"
    padding: "12px 0"
---

# Design System: X Ray

## Overview

**Creative North Star: "La sala de control tranquila"**

Una sala de operaciones en calma: densa pero ordenada, con el estado de cada empresa legible de un vistazo y sin alarmas que no tengan causa. Cada pantalla se juzga por esa imagen: si algo grita sin motivo, sobra; si algo importante no se lee a dos metros, falta jerarquía.

X Ray vive hoy sobre el chrome Embat (`web/components/embat/`): tema claro, tipografía Inter, lienzo blanco, sidebar crema de 280 px y un único acento verde. Es un sistema de densidad media y material plano: las tarjetas se separan con un borde frío de 1 px y una sombra mínima, la jerarquía se construye con tamaño y tracking, y el color se reserva para el estado (outlook, banda, uplift) y para el acento de interacción.

El tono visual es sobrio y de lectura tranquila: nada de degradados, glassmorphism ni elevaciones dramáticas. Los números son tabulares (`tabular-nums`) para que las columnas no bailen; las etiquetas de sección van en 14 px, los rótulos de dato en 12 px y los encabezados de página en Inter Display 20 px. Los radios son generosos (la escala arranca en 1 rem), así que la forma dominante es la tarjeta redondeada de borde fino, no el bloque duro.

El chrome de producto es claro por defecto: el bloque `.embat-ui` fuerza fondo blanco, tinta negra y borde `#dce0e6` incluso si la app entra en modo oscuro, de modo que las pantallas del score no tienen una variante nocturna real. `docs/frontend_v0.md` y el look shadcn/Geist de `components/xray/*` (cards muy redondeadas, fuentes de plantilla) son el anti-referente histórico, no el sistema vigente.

**Key Characteristics:**
- Un solo acento: verde `#146c43`; el color restante es semántico (positivo / estable / negativo / aviso).
- Material plano: borde de 1 px `#dce0e6` + sombra de tarjeta mínima; sin profundidad tonal por capas.
- Radios amplios y consistentes derivados de `--radius: 1rem` (`rounded-xl` = 22,4 px, `rounded-2xl` = 28,8 px).
- Tipografía Inter con tracking negativo proporcional al tamaño (≈ −0,01 em).
- Números tabulares y formato `es-ES`; la palabra siempre acompaña al color del estado.

## Colors

Paleta clara y de bajo croma: blanco de lienzo, un verde de marca y una familia de grises fríos, con un juego corto de colores de estado usados solo en chips y series.

### Primary
- **Verde Embat** (`#146c43`): único acento de marca. Es `--primary`, `--accent` y `--ring`; pinta el botón primario, el ítem de navegación activo (sobre tinte `primary/15`), los enlaces (`text-primary`), el tramo de barra de progreso y la línea de caja del gráfico. Contraste 6,45:1 sobre blanco y 5,83:1 sobre el cream del sidebar.

### Neutral
- **Blanco de superficie** (`#ffffff`): fondo de página, de tarjeta y de popover; también es la tinta sobre el verde primario.
- **Crema de sidebar** (`#f6f3ee`): solo el panel lateral; es el único color cálido y marca la separación de la zona de navegación.
- **Gris de superficie** (`#f5f6f8`): `--secondary` / `--muted`; fondo de tiles, de barras sin relleno, de chips estables y de inputs embebidos.
- **Borde frío** (`#dce0e6`): `--border` / `--input`; el único borde del sistema: tarjetas, separadores de fila y columna, rejilla de gráficos, ejes de tooltip. Casi nunca es borde de foco.
- **Tinta primaria** (`#000000`): texto de titulares, valores y filas. Es `--foreground`.
- **Tinta secundaria** (`#666666`): `--muted-foreground`; texto de apoyo, subtítulos de fila, ítems de navegación inactivos en Ajustes y descriptores de tarjeta.
- **Tinta terciaria** (`#6b6b6b`): rótulos de sección de tarjeta, ticks de ejes y placeholders. Convive con `#666666` sin una regla que los distinga.
- **Tinta de navegación** (`#333`): texto de los ítems de navegación inactivos del sidebar.

### Semantic status
- **Verde positivo** (`#00a14e`): outlook positivo y deltas al alza; en chips lleva fondo `rgba(215,247,194,0.5)` y borde `rgba(166,235,132,0.7)`.
- **Rojo negativo** (`#e61847`): outlook negativo y deltas a la baja; fondo `#fef4f6` y borde `#fbd3dc`.
- **Estable**: no tiene color propio; hereda `surface-muted` + `ink-secondary` (`statusClass` devuelve `border-border bg-muted text-muted-foreground`).
- **Ámbar de identificador** (`#ef8000`): chip de `company_id` en la ficha (`ficha.tsx`), sobre `rgba(239,128,0,0.05)`. No está tokenizado.
- **Rojo de alerta** (`#eb002b`): banda superior de aviso crítico en `FichaFrame`; texto blanco de 12 px.
- **Violeta de comisión** (`#6d28d9`): importe de fee de originación en el marketplace, sobre `rgba(163,75,203,0.1)`. No está tokenizado.

### Named Rules
**The Single Accent Rule.** El verde `#146c43` es el único color de interacción. El resto de la paleta codifica estado (positivo / estable / negativo) o estructura (blanco, crema, gris, borde); ningún elemento decorativo introduce un segundo acento.

**The Word-Before-Color Rule.** Un color de estado nunca viaja solo: todo chip de outlook, banda o delta lleva su etiqueta textual encima. Es un requisito de accesibilidad del producto, no una preferencia.

### Inconsistencies
- `web/components/embat/anticipacion.tsx:52` fija `#11a8ff` (cian) en un chip, mientras el token primario vivo es `#146c43`. `docs/frontend_v0.md` sigue documentando el cian como acento; hoy es un residuo fuera de la ficha.
- Dos grises casi idénticos conviven sin criterio explícito: `#666666` (muted-foreground) y `#6b6b6b` (rótulos de tarjeta / ticks de gráfico).
- `#ef8000` y `#eb002b` existen solo como hex sueltos en `ficha.tsx`; no tienen token.

## Typography

**Display Font:** Inter Display (con Inter Variable, ui-sans-serif, system-ui como fallback).
**Body Font:** Inter Variable (con `--font-inter-variable`, ui-sans-serif, system-ui como fallback).
**Label/Mono Font:** la misma Inter Variable; no hay fuente de etiquetas ni monoespaciada propia.

**Character:** Una sola familia en dos cortes: Inter Variable (100–900) para toda la UI y Inter Display Medium (500) solo para títulos de 20 px —el wordmark «X Ray» y el `h1` de la ficha. El tracking es negativo y crece con el tamaño, lo que da un aire compacto y preciso sin llegar a apretado. Todas las cifras usan `tabular-nums`.

### Hierarchy
- **Display** (500, 20px, −0,3px): títulos de página y wordmark (`FichaTitle`, `app-shell.tsx`). Es el único uso de Inter Display.
- **Headline** (500, 28px, −0,28px): valor de las KPI del dashboard (`KpiCard`).
- **Title** (500, 15px, −0,15px): título de fila: drivers, acciones y filas de lista (`DriverRow`, `ActionRow`, `ItemTitle`).
- **Body** (500, 14px, −0,14px): texto por defecto de la consola; también nombre de empresa y celdas de tabla.
- **Body small** (500, 13px, −0,13px): breadcrumbs, chips, popovers y copy de confianza.
- **Label** (500, 12px, −0,12px): rótulos de sección, captions y chips pequeños. Los rótulos de tile bajan a 11 px (−0,11px) y pueden ir en mayúsculas; los ejes de gráfico usan 10–11 px.

### Named Rules
**The Proportional Tracking Rule.** El tracking escala con el cuerpo del texto a razón de ≈ −0,01 em: 28 px → −0,28; 20 px → −0,3; 15 px → −0,15; 14 px → −0,14; 13 px → −0,13; 12 px → −0,12; 11 px → −0,11. Las excepciones de chip se desvían del patrón (`−0,21px` a 14 px, `−0,18px` a 12 px) y son deuda, no doctrina.

**The Tabular Figures Rule.** Toda cifra que se pueda comparar en columna (scores, importes, tasas, deltas, fechas) lleva `tabular-nums`. El texto narrativo no.

## Layout

El chrome fija una estructura de dos zonas: un sidebar `sticky` de **280 px** (`w-[280px]`) con `padding: 30px`, y una columna de contenido fluida. El contenido respira con un gutter de **50 px** en los cuatro lados (`px-[50px] py-[50px]`); por debajo de `lg` (1024 px) el gutter cae a **24 px** (`max-lg:p-6`, `max-lg:px-6`). El header de migas es `sticky`, de **48 px** mínimos, y comparte el gutter de 50 px.

El ritmo viene de un puñado de pasos repetidos: 5 px (separaciones finas), 10 px (gap base dentro de tarjeta), 15 px (padding de tarjeta y header de sección), 20 px (padding lateral de sección), 30 px (separación entre bloques y entre tarjetas) y 50 px (gutter de página). Las rejillas de tarjetas son `flex flex-wrap` con `gap-[30px]` y tarjetas `flex-1 min-w-[260px..280px]`, de modo que refluyen sin media queries dedicadas. Las KPI usan `flex-wrap gap-4`. Los tiles de comparables usan `grid grid-cols-2 … sm:grid-cols-4` con `gap-2.5`. El layout de marketplace es dos columnas: lista fluida + rail derecho `max-w-[280px]`.

Densidad media: filas de lista de ~48 px (`py-3`), tarjetas de ficha de 220–300 px de alto, gauge contenido a 224×280 px.

## Elevation & Depth

El sistema es **plano por defecto**. La profundidad se comunica con borde + una sombra de un solo nivel, nunca con capas tonales ni con sombras apiladas. Las tarjetas de ficha y de dashboard usan `border border-border bg-white shadow-sm`; el popover sube un nivel con su propia sombra, y el diálogo se separa con `ring-1 ring-foreground/5` en lugar de sombra. No hay superficies elevadas permanentes ni degradados.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0px 1px 2px 0px rgba(13,19,30,0.1)`): sombra base de tarjeta y contenedores; también aparece como `shadow-sm` de Tailwind en las cards de ficha.
- **Tooltip / popover** (`box-shadow: 0px 1px 1px rgba(13,19,30,0.1)`): popovers de racional y confianza.
- **Popover flotante estándar** (`shadow-2xl` de Tailwind): `PopoverContent` base antes del override.
- **Diálogo** (`ring-1 ring-foreground/5`): sin sombra; el borde de 1 px lo separa del overlay `bg-black/80` con `backdrop-blur-xs`.

### Named Rules
**The Flat-By-Default Rule.** Las superficies están planas en reposo y se separan con el borde `#dce0e6`. La sombra existe solo para flotar (popover, tooltip) o para marcar una tarjeta sobre el lienzo blanco; nunca para simular jerarquía dentro de una tarjeta.

## Shapes

La forma dominante es la tarjeta rectangular de esquinas redondeadas y borde fino. La escala de radios se deriva de `--radius: 1rem` (`16px`), que el chrome Embat fija —no el `0.875rem` de la plantilla—: `rounded-sm` **9,6 px**, `rounded-md` **12,8 px**, `rounded-lg` **16 px**, `rounded-xl` **22,4 px**, `rounded-2xl` **28,8 px**, `rounded-3xl` **35,2 px**, `rounded-4xl` **41,6 px**. En pantalla, los chips, botones, inputs e ítems de navegación usan `rounded-xl` (22,4 px); las tarjetas y los skeletons, `rounded-2xl` (28,8 px); los diálogos base, `rounded-4xl` (41,6 px).

Los bordes son siempre de 1 px y del mismo `#dce0e6`. Los pocos elementos circulares son funcionales: avatar `rounded-full`, puntos de confianza `size-1.5 rounded-full`, barras de progreso `rounded-full`. Hay radios diminutos explícitos en enlaces (`rounded-[2px]`) y en las puntas de las barras de benchmark (`[0,4,4,0]`).

### Named Rules
**The One-Rem Radius Rule.** Los radios no se eligen por instinto de Tailwind: se derivan del `--radius` del chrome (1 rem). Cualquier valor "de librería" (4 px, 8 px) contradice el sistema; `docs/frontend_v0.md` todavía describe «radio 4px», que es herencia.

### Inconsistencies
- El diálogo base usa `rounded-4xl` (41,6 px) mientras las tarjetas usan `rounded-2xl` (28,8 px); la diferencia no responde a una regla escrita.
- Los radios diminutos `rounded-[2px]` / `rounded-[4px]` de algunos enlaces y chips escapan de la escala.

## Components

**Carácter: tabular y denso.** Todo componente aspira a leerse como una tabla bien compuesta: cifras alineadas, chrome mínimo alrededor del dato, controles pequeños (13–14 px) que no compiten con los valores. El vocabulario es corto y reutilizado: botón, chip (filtro y estado), tarjeta, tile, fila de lista, input y navegación. Todos comparten el borde `#dce0e6`, el radio `rounded-xl` y una transición de color de 150 ms.

### Buttons
- **Shape:** esquinas `rounded-xl` (22,4 px); altura 36 px (`h-9`) por defecto, 32 px (`h-8`) en `size="sm"`, 24 px (`h-6`) en `size="xs"`.
- **Primary:** fondo verde `#146c43` y texto blanco (`--primary` / `--primary-foreground`); hover `bg-primary/80`. Es el acento escaso: comparar, aplicar filtro, confirmar.
- **Secondary / Outline:** fondo blanco, borde `#dce0e6`, texto `ink-secondary`; hover `bg-input/50`. Es el botón por defecto de filtros e importación.
- **Ghost:** fondo transparente y hover `bg-muted`; se usa en «Buscar» y «Limpiar».
- **Hover / Focus:** transición solo de color (150 ms, `ease-out`), respetando `motion-reduce`; el foco es el anillo compartido `embatFocusRing` (outline 2 px del color de `--ring` = `#146c43`, offset 2 px). En filas se usa `embatRowFocusRing` con offset −2 px para que no lo recorte el contenedor.
- **Active:** el botón base se desplaza 1 px (`active:translate-y-px`).

### Chips
- **Style:** `rounded-xl` (22,4 px), borde de 1 px, tipografía 12–13 px con tracking −0,12/−0,13 px. `FilterChip` es outline blanco con texto `ink-secondary` y, cuando está activo, borde y texto verdes.
- **State:** los chips de estado usan el color semántico con su palabra (`Estado: Positivo`, `Negativo`, `Estable`), nunca solo color. Los chips de marca (`Demo`, fecha) usan tinte verde `bg-primary/5 border-primary/20 text-primary`.
- **Chip de identificador:** ámbar `#ef8000` sobre tinte, en `FichaChips`.
- **De comisión (marketplace):** violeta `#6d28d9` sobre `rgba(163,75,203,0.1)`.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (28,8 px).
- **Background:** blanco `#ffffff` sobre el lienzo blanco; el sidebar crema es la única superficie teñida.
- **Shadow Strategy:** ver *Elevation & Depth* — `shadow-sm` / `0 1px 2px rgba(13,19,30,0.1)`.
- **Border:** 1 px `#dce0e6`, siempre.
- **Internal Padding:** 15 px (`p-[15px]`) o 20 px lateral con 15 px vertical en los headers (`px-5 py-[15px]`); el título de tarjeta va en 14 px con tracking −0,14 px.

### Inputs / Fields
- **Style:** alto 32 px, `rounded-xl`, sin borde y fondo `surface-muted` (`border-0 bg-muted shadow-none`) dentro de los popovers de filtro; en selects, borde `#dce0e6` sobre blanco al 30 % de input.
- **Focus:** `embatFocusRing` de 2 px con offset 2 px.
- **Disabled:** opacidad 50 % y `pointer-events: none` (botón base).

### Navigation
- **Style:** sidebar fijo de 280 px sobre `#f6f3ee`. Ítems `rounded-xl` con `px-2.5 py-2`, tipografía 14 px / −0,14 px; el activo se marca con `bg-primary/15 text-primary` más una barra vertical de 1 px a la izquierda (`left-[-30px]`) para que funcione sin color.
- **Default / Hover:** inactivo `#333`; hover `bg-black/[0.04]`. «Buscar» es un botón fantasma y «Ajustes» usa `#666`.
- **Mobile:** no hay drawer propio; el sidebar es `sticky` y el contenido cae a gutter de 24 px por debajo de `lg`.

### Signature Components
- **KPI card:** valor 28 px tabular, etiqueta 13 px `ink-secondary` y hint 12 px; mismo borde y sombra de tarjeta.
- **Peer tile:** fondo `surface-muted`, `rounded-xl`, rótulo 11 px en mayúsculas y valor 14 px tabular.
- **Tabla de empresas / ofertas:** filas `Item` sin tarjeta propia, separadas por `ItemSeparator`, fondo transparente y hover `bg-muted/50`; checkbox, título, badges de score/estado, tasa y cierre.
- **Gráficos:** Recharts (`treasury-chart`, `peers-benchmark`, `score-trajectory`). Rejilla discontinua `#dce0e6`; ticks 10–11 px `#6b6b6b`; la serie propia en `var(--primary)` y los vecinos en `#dce0e6`; tooltip blanco con borde `#dce0e6`, radio 6 px y fuente 12 px.

## Do's and Don'ts

Voz confirmada (20 sep 2026): sobrio, preciso, tranquilo. Un rojo se explica, no se grita.

### Do:
- **Do** acompañar siempre el color de estado con su palabra: banda, outlook y delta se leen sin color (requisito de accesibilidad del producto).
- **Do** formatear toda cifra en `es-ES` (coma decimal, fechas y moneda locales) y usar `tabular-nums` en columnas.
- **Do** mantener el verde `#146c43` como único acento de interacción y reservar el color para el estado.
- **Do** derivar radios del `--radius` del chrome (1 rem) y usar `rounded-xl` en controles y `rounded-2xl` en tarjetas.
- **Do** separar superficies con el borde `#dce0e6` de 1 px y, como mucho, la sombra de tarjeta de un nivel.
- **Do** etiquetar los dos números 0–100 (Health Score de la ficha vs. uplift what-if del marketplace) con su nombre propio y su contexto; nunca presentarlos como el mismo score.
- **Do** buscar cada cifra en el fact pack, un tool o el ingest: el LLM redacta, no calcula.

### Don't:
- **Don't** reintroducir el cian `#11a8ff` como primario (residuo en `anticipacion.tsx`; `docs/frontend_v0.md` está desactualizado).
- **Don't** usar los radios "de librería" (4 px / 8 px) que describe `docs/frontend_v0.md`: son el anti-referente de la plantilla.
- **Don't** revivir el look shadcn/Geist de `components/xray/*` (cards muy redondeadas, fuentes de plantilla) como identidad de producto.
- **Don't** introducir un segundo acento decorativo, degradados, glassmorphism ni sombras apiladas.
- **Don't** presentar empresas sintéticas como reales ni insinuar que el score es una probabilidad de impago.
- **Don't** importar `lib/xray/registry/` desde pantallas o `components/xray/**`; todo dato pasa por `provider`.
- **Don't** hardcodear un hex donde ya existe token (`#ef8000`, `#eb002b`, `#6d28d9` son deuda pendiente de tokenizar).
