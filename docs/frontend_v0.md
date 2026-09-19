# Frontend v0 — X Ray demo

Last updated: 2026-09-19 (Blob session + `/start` + portfolio por grupo)

Demo de pantallas dentro de `web/`. Sin auth, sin sidebar. Hay backend propio: rutas `app/api/xray/*` (Next) y, para importar CSV, FastAPI de ingest (`POST /ingest`), no `GET /score`.

Todo el dato de UI pasa por un único seam: `provider` en [`web/lib/xray/provider.ts`](../web/lib/xray/provider.ts). Cómo está cableado el resto (fact pack, Eve, dos scores): [`auditoria_plataforma.md`](auditoria_plataforma.md). Persistencia mutable en Vercel Blob (JSON), no Postgres ni Supabase.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | Portfolio del **grupo activo**: filtros (grupo/banda/divisa/origen) + búsqueda + Importar en el header; score/banda en cada fila |
| `/start` | Ruta oculta (noindex): elige el grupo compartido de la demo |
| `/c/[companyId]` | Ficha: pills Health Score / Dimensiones (radiales), sub-scores con barras, drivers, acciones 1-col (click → marketplace) + Trayectoria con forecast 6m. Sin título de página |
| `/c/[companyId]/a/[actionId]` | Amortize dashboard o marketplace (ofertas izquierda, importe derecha; barra apilada score + uplift) |
| `/c/[companyId]/a/[actionId]/p/[productId]` | Detalle producto (página, no modal). `?p=` redirige aquí. Solicitar → 10s → Aprobar |
| `/chat` | Chat del agente (fuera del shell advisor) |
| `/s`, `/s/[sessionId]` | Chat sin sesión / reanudar sesión |

Chrome: tema claro, `max-w-7xl` / padding estrecho, breadcrumb-only (sin h1/descripción), sin badges «Eve». Reasoning = icono (i) + tooltip.

## Persistencia Blob (demo DB)

| Prefijo | Qué |
|---|---|
| `xray/session.json` | `{ group_id }` compartido en la URL live |
| `xray/imports/{id}.json` | Packs CSV importados |
| `xray/recommendations/{company:action}.json` | Decisiones Eve marketplace |
| `xray/actions/{id}.json` | Títulos/rationale de ficha Eve |
| `xray/deals/{id}.json` | Ofertas aprobadas |
| `xray/alerts/{key}.json` | Dedupe del watcher |

Fact pack (`companies.json` / `facts.json` / `scores.json`) sigue en git. Sin `BLOB_READ_WRITE_TOKEN`, Maps en memoria (dev local).

## Seam — `XrayProvider`

```ts
export const provider: XrayProvider = eveProvider;
```

`eveProvider` solo habla con `/api/xray/*` (el fact pack no entra en el bundle del browser). `mockProvider` existe para tests; **no** es el provider activo.

Métodos: `listCompanies`, `getScore`, `listActions`, `listProducts`, `getNegotiation`, `getAmortizeContext`, `importCompanies`.

Cada bloque de datos lleva `origin: "ml" | "llm" | "eve" | "deterministic"`. El export Python escribe `origin: "ml"` aunque el motor sea reglas + isotónica.

**Regla:** ninguna pantalla ni componente de `components/xray/` importa `lib/xray/registry/`. Solo el provider. Las rutas `app/api/xray/*` sí pueden usar registry en servidor.

El contrato de ficha es `ScoreSnapshot` (Zod en `web/lib/xray/schemas.ts`). El JSON crudo de `xray-export-web` **no** trae `band` / `sub_scores` / `alerts`: los deriva `snapshotFromExported`. `docs/plan.md` §6 es el diseño del viernes, no este objeto.

## Fórmulas

### Health Score (Python, ficha)

El número del gauge lo calcula `xray.rules` (mapa isotónico). Next no lo recompute. Regenerar: `uv run xray-export-web`.

### Uplift / radar (`scoring.ts`) — otro 0–100

`score = Σ weight_d · dim_d · 100` con pesos liquidez 0.28, cobros 0.18, pagos 0.18, deuda 0.26, actividad 0.10.

`applyAction(snapshot, action, amount)` escala los `dimension_deltas` por `amount / recommended_amount` (tope 1.5×), clampea dims a [0,1], recompone score y banda. **La misma función** alimenta uplift de acción y de producto. No es un movimiento del mapa isotónico; en pantalla es impacto what-if sobre dimensiones.

### Match bilateral (`match.ts`)

- `clientFit` = cobertura + coste vs deuda actual + plazo vs ciclo de caja + holgura DSCR
- `issuerAppetite` = banda vs apetito + ticket vs sweet spot + margen + cross-sell
- `match = 2·c·i / (c+i)` (media armónica; un 0 anula el deal)
- `solveIdealAmount` maximiza uplift con DSCR ≥ 1.2
- `issuerTerms` = términos más caros que el cliente aún acepta (clientFit ≥ 0.45). El hueco vs `client_ideal_terms` es la superficie de negociación.

`POST /api/xray/recommend` deja al LLM ids, textos e importe; `reassembleMatches` vuelve a calcular match, uplift y banda. Fallback: `deterministicMarketplace`.

El detalle de producto no cierra el flujo: `termImprovements` (determinista) sugiere mejoras; Solicitar → countdown 10 s → Aprobar persiste el deal en Blob (`xray/deals/`) y redirige a `/c/{id}?closed=1`.

### Import CSV (`csv.ts` + `mapping.ts`)

`readCsvPreview(file)` lee solo los primeros 64 KB. `suggestMapping` alinea cabeceras a los 9 datasets del diccionario. Trampas documentadas en UI: invoices sin `direction`, balances = foto final, `payment_date` falso en overdue.

`POST /api/xray/import` proxea a `XRAY_API_URL/ingest` (tope 4,5 MB en Vercel), persiste en Blob y dispara el watcher. Invalida recommendations, actions y deals de las empresas re-scored.

## Qué ya está cableado vs qué no

| Sistema | Estado |
|---|---|
| Health Score | Python → `scores.json` → `snapshotFromExported` |
| Acciones / facts | `recommendActions` + `facts.json`; Eve redacta títulos; sin fallback TEMPLATES en API |
| Marketplace Eve | quantity → offering → match; cifras recomputadas en servidor |
| Import CSV | FastAPI `POST /ingest` + Blob |
| Grupo activo | Blob `session.json` + `/start` |
| Chat Eve | `/chat`, `/s`; tools leen el mismo fact pack |
| Watcher | `watch-rules.ts` + cron + post-import |
| `GET /score` FastAPI, `/debt`, `/whatif`, `/explain` | **No existen.** Plan §6, no runtime |
| Supabase | deps de plantilla; 0 uso de producto (demo = Blob JSON) |
| Monte Carlo / `xray/rates` | pendientes |

## Tests

```bash
cd web && npm test
```

Vitest sobre `lib/xray` (bands, scoring, match, store, deals, …), `hooks/xray`, `agent/lib` y evals de calibración.
