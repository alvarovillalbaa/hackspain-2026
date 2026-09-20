# Frontend v0 — X Ray demo

Last updated: 2026-09-20 (widget board en `/`, tokens semánticos, TimeoutState, search plain)

Demo de pantallas dentro de `web/`. Chrome advisor: sidebar cream (`#f6f3ee`) + Inter Variable / Inter Display, nav activo en ink `#333333` (no verde), wordmark “X Ray” (sin logo Embat). Footer: Ajustes + identidad demo “Alvaro Villalba”. Hay backend propio: rutas `app/api/xray/*` (Next) y, para importar CSV, FastAPI de ingest (`POST /ingest`), no `GET /score`.

Todo el dato de UI pasa por un único seam: `provider` en [`web/lib/xray/provider.ts`](../web/lib/xray/provider.ts). Cómo está cableado el resto (fact pack, Eve, dos scores): [`auditoria_plataforma.md`](auditoria_plataforma.md). Persistencia mutable en Vercel Blob (JSON), no Postgres ni Supabase.

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | Dashboard: tablero de widgets (6 cols, drag/resize, `localStorage`); KPIs + hist + outlook + top/bottom + watch |
| `/companies` | Empresas (tabla: score, estado, situación, tipo, cierre + filtros + comparar + import; link a grupo) |
| `/acciones` | Acciones recomendadas portfolio-wide (deterministas; overlay títulos Blob) |
| `/productos` | Libro de deuda viva (`facts.contracts`) + deals contratados |
| `/grupos` | Tabla de grupos (sin entrada en sidebar; capacidad conservada) |
| `/grupo-empresarial` | Redirect a `/` |
| `/start` | Operador (noindex): fija el grupo foco en Blob (reset deals/acciones) y abre `/g/{id}`. No filtra las tablas. |
| `/c/[companyId]` | Ficha: gauge + desglose Bankability/Business + drivers + acciones + trayectoria 3/6/12m + radar + peers + deal/import |
| `/g/[groupId]` | Ficha de grupo: mismo spine + acciones del grupo + empresas |
| `/c/[companyId]/a/[actionId]` | Amortize dashboard o marketplace (tabla Ofertas + pipeline Eve + importe) |
| `/c/[companyId]/a/[actionId]/p/[productId]` | Detalle producto (página). Contratar → modal 10s → Aprobar → Blob deal |
| `/compare` | Comparar 2–3 empresas (desde `/companies`) |
| `/chat` | Chat del agente (mismo shell advisor) |
| `/s`, `/s/[sessionId]` | Chat sin sesión / reanudar sesión |

Chrome advisor: tema claro almost-white `#fafafa`, Inter, radio amplio, primary dark green `#146c43` solo en CTAs/focus. Semántica: positive `#00a14e`, warning `#ef8000`, destructive `#e61847`, descriptions `#666`, table headers `#999`, ink `#333`. Reasoning = icono (i) + tooltip. Fallos Eve: `ErrorState` / `TimeoutState` (`AiFailureState`).

## Persistencia Blob (demo DB)

| Prefijo | Qué |
|---|---|
| `xray/session.json` | Grupo foco de ensayo (`/start`); no filtra tablas |
| `xray/imports/{id}.json` | Packs CSV importados |
| `xray/import-csvs/{id}.json` | Tablas canónicas del import (re-ingest Python al aprobar deal) |
| `xray/recommendations/{company:action}.json` | Decisiones Eve marketplace |
| `xray/actions/{id}.json` | Títulos/rationale de ficha Eve |
| `xray/deals/{id}.json` | Ofertas aprobadas |
| `xray/alerts/{key}.json` | Dedupe del watcher |

Fact pack (`companies.json` / `facts.json` / `scores.json`) sigue en git. Sin `BLOB_READ_WRITE_TOKEN`, Maps en memoria (dev local).

## Seam — `XrayProvider`

```ts
export const provider: XrayProvider = eveProvider;
```

`eveProvider` solo habla con `/api/xray/*` (el fact pack no entra en el bundle del browser). No hay `mockProvider`: el portfolio sale de `lib/xray/dataset/` (Health Scorer + facts de `docs/data/raw`).

Métodos: `listCompanies`, `listGroups`, `listCompanySummaries`, `listPortfolioActions`, `listBookProducts`, `getScore`, `listActions`, `listProducts`, `getNegotiation`, `getAmortizeContext`, `importCompanies`.

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

El detalle de producto cierra el flujo con el modal Contratar Préstamo: Solicitar → countdown 10 s → Aprobar persiste el deal en Blob (`xray/deals/`) y redirige a `/c/{id}?closed=1`.

### Import CSV (`csv.ts` + `mapping.ts`)

`readCsvPreview(file)` lee solo los primeros 64 KB. `suggestMapping` alinea cabeceras a los 9 datasets del diccionario. Trampas documentadas en UI: invoices sin `direction`, balances = foto final, `payment_date` falso en overdue.

`POST /api/xray/import` proxea a `XRAY_API_URL/ingest` (tope 4,5 MB en Vercel), persiste pack + CSVs canónicos en Blob y dispara el watcher. Invalida recommendations, actions y deals de las empresas re-scored. Aprobar un deal re-llama a `/ingest` sobre esas tablas mutadas; si no hay CSVs o la API cae, overlay TypeScript.

## Qué ya está cableado vs qué no

| Sistema | Estado |
|---|---|
| Health Score | Python → `scores.json` → `snapshotFromExported` |
| Acciones / facts | `recommendActions` + `facts.json`; Eve redacta títulos; sin fallback TEMPLATES en API |
| Marketplace Eve | quantity → offering → match; cifras recomputadas en servidor |
| Import CSV | FastAPI `POST /ingest` + Blob |
| Grupo foco (demo) | Blob `session.json` + `/start`. No filtra tablas; chip «Demo» en `/grupos`. |
| Chat Eve | `/chat`, `/s`; mismo shell; tools leen el mismo fact pack |
| Watcher | `watch-rules.ts` + cron + post-import |
| `GET /score` FastAPI, `/debt`, `/whatif`, `/explain` | **No existen.** Plan §6, no runtime |
| Supabase | deps de plantilla; 0 uso de producto (demo = Blob JSON) |
| Monte Carlo / `xray/rates` | pendientes |

## Tests

```bash
cd web && npm test
```

Vitest sobre `lib/xray` (bands, scoring, match, store, deals, …), `hooks/xray`, `agent/lib` y evals de calibración.
