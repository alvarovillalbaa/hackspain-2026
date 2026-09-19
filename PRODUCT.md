# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Usuario principal (confirmado 19 sep 2026): el **gestor financiero de la pyme** — el CFO, director financiero o el propio dueño que lleva la tesorería. Tiene 24 meses de movimientos, facturas y deuda cargados en Embat y quiere saber cómo estará su caja dentro de seis meses, por qué, y si le conviene pedir financiación o refinanciar la que tiene. No es analista: lee un score y una tendencia, no una tabla de features.

El asesor de Embat **ya no es usuario** (decisión del 19 sep): Embat es el canal y el comprador del módulo, no quien mira la pantalla. El código y `docs/frontend_v0.md` todavía hablan de «consola del asesor»; esa vocabulario es heredado, no la intención actual.

El jurado de HackSpain 2026 es la audiencia de la demo: debe entender el score en tres minutos sin conocer el dataset.

## Product Purpose

X Ray calcula un **score de financiabilidad 0–100 a seis meses** solo con datos de tesorería (días de caja, impagos a proveedores, cobertura de cuotas, flujo neto), lo presenta como trayectoria al estilo de una agencia de rating (banda + outlook + trend + watch + abanico a seis meses), reparte cada cambio entre las cuatro señales, y encima recomienda acciones y cotiza productos de financiación sobre un catálogo.

Éxito, confirmado por el equipo: (1) el jurado entiende el score en tres minutos; (2) el gestor sale sabiendo qué puede hacer hoy con su financiación.

Decisión **abierta** (no tomada): convertir el marketplace en un *marketmaker* donde las entidades pujan por financiar a la pyme usando el score como precio. Hasta que se decida, el núcleo sigue siendo el score, su explicación y las acciones.

## Positioning

**Trayectoria, no foto.** El banco mira el balance de ayer; X Ray mira la tendencia de la tesorería —banda, outlook, watch, abanico— y ve el deterioro meses antes de que el banco lo vea en un balance. Ningún competidor con una foto estática puede decir esto con verdad.

## Operating Context

- Reto de Embat en HackSpain 2026 (18–20 sep, ETSIT UPM, Madrid). La demo corre sobre el fact pack en git (`web/lib/xray/dataset/`); `/start` fija un grupo de ensayo.
- Datos: 1.286 empresas **sintéticas**, 24 meses, 9 CSV de tesorería. Importación de CSV propios vía FastAPI `POST /ingest`.
- Pantallas: `/` grupos, `/companies`, ficha `/c/[id]`, ficha de grupo `/g/[id]`, acción → marketplace → detalle de producto (`/c/[id]/a/[actionId]/p/[productId]`), `/compare`, chat Eve en `/chat`.
- Idioma de la interfaz: español; números y fechas en formato `es-ES`; monedas en euros (las 137 empresas no-EUR muestran su moneda sin convertir).
- El equipo mezcla Windows y macOS; deploy en Vercel.

## Capabilities and Constraints

- **El LLM nunca calcula.** Score y features son deterministas en Python; Eve redacta sobre el JSON del fact pack. Toda cifra en pantalla debe existir en el fact pack, en un tool o en el ingest.
- Hay **dos números 0–100 distintos**: el Health Score (mapa isotónico, el gauge de la ficha) y el uplift del marketplace (`scoring.ts`, impacto what-if sobre dimensiones). No son comparables y la interfaz no debe presentarlos como el mismo score.
- La ficha es el contrato `ScoreSnapshot` (Zod, `web/lib/xray/schemas.ts`); toda la UI lee a través de `lib/xray/provider.ts`.
- Vocabulario del producto: score, banda, outlook, trend, watch, abanico a 6 meses, señales/drivers, acción, oferta/producto, uplift, match, deal.
- Persistencia demo: JSON en git + Vercel Blob. Sin base de datos para el score.
- El score es un pronóstico de persistencia, **no una probabilidad de impago**; la interfaz no debe insinuar lo contrario.
- Pendiente de decidir: marketmaker (ver Product Purpose). Pendiente de actualizar: docs y componentes que nombran al «asesor».

## Brand Commitments

- Nombre: **X Ray** (score de financiabilidad; Embat es el cliente/canal, no la marca del producto).
- Personalidad confirmada: **sobrio, preciso, tranquilo**. La confianza viene de la exactitud, no del énfasis.
- Restricción visual aportada por el usuario (19 sep 2026, registrada sin ampliar): la dirección es **la temática más nueva del repo**, el chrome Embat de `web/components/embat/` — desde el PR #34 (20 sep) incluye `dashboard.tsx`, `ficha.tsx`, `companias.tsx`, `ofertas.tsx`, `contratar-prestamo.tsx`, `treasury-chart.tsx`, `signals-dialog.tsx`, `peers-benchmark.tsx`, `chrome.tsx`, con sidebar crema `#f6f3ee` y wordmark «X Ray» en `components/xray/app-shell.tsx`. El look anterior de `components/xray/*` (plantilla shadcn por defecto, Geist/Noto/Source Sans, cards muy redondeadas) es el anti-referente.
- Activos en disco: Inter Variable e Inter Display en `web/public/embat/fonts/`; iconos en `web/public/embat/*.svg`.

## Evidence on Hand

- Métricas reales del método en el fact pack (`metrics.json`, panel «Cómo anticipa el score»): meses de antelación, persistencia a 6 meses, acierto de orden (AUC), cobertura del abanico, eficacia del watch. Respaldo en `docs/model_card.md` y `docs/auditoria_health_score.md`.
- Catálogo de productos de financiación: `product_catalog.json` (único inventario de ofertas; el subagente `offering` cotiza sobre él, no inventa productos).
- Explicación sin tecnicismos: `docs/MODEL_toni.md`, `docs/sistema_en_cinco_figuras.html`.
- **No hay** testimonios, clientes reales, logos de entidades ni cifras de negocio: no fabricarlos. Las empresas son sintéticas y no deben presentarse como reales.

## Product Principles

1. **Trayectoria antes que foto.** Banda, outlook y abanico mandan en la jerarquía; el número de hoy es el punto de partida, no el titular.
2. **Cada cifra tiene su porqué a un clic.** El score se reparte entre cuatro señales y el texto solo redacta lo que ya está en los datos.
3. **Tres minutos para entenderlo.** Score → porqué → qué hacer, en ese orden, sin que el lector tenga que buscarlo.
4. **La calma viene de la exactitud.** Un rojo se explica, no se grita; nada de alarma teatral ni de promesas que el modelo no respalda.
5. **Del diagnóstico a la decisión.** Toda pantalla termina en algo que el gestor puede hacer hoy con su financiación.

## Accessibility & Inclusion

WCAG AA, con un compromiso adicional confirmado: la **banda y el estado del score siempre legibles sin color** (texto o forma además del color). Contraste mínimo 4,5:1 en texto; toda la consola navegable con teclado.
