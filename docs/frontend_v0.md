# Frontend v0 — X Ray demo

Demo de pantallas dentro de `web/`. Sidebar Embat en grupos, compañías y ficha; marketplace y resto usan AppShell.
Todo el dato pasa por un único seam: `provider` en [`web/lib/xray/provider.ts`](../web/lib/xray/provider.ts).

## Pantallas

| Ruta | Qué hace |
|---|---|
| `/` | Grupos empresariales (tabla Embat, rollup por `group_id`) |
| `/g/[groupId]` | Ficha Embat del grupo: score ponderado, desglose, drivers, acciones, trayectoria, empresas |
| `/companies` | Compañías: score, estado, situación, tipo actual, cierre; import CSV |
| `/grupo-empresarial` | Redirect a `/` |
| `/c/[companyId]` | Ficha Embat: score, desglose, drivers, acciones, trayectoria |
| `/c/[companyId]/a/[actionId]` | Marketplace de productos ordenado por match |
| `?p=PRODUCT_ID` | Expansión full-screen del producto (negociación) |
| `/chat` | Chat Eve (movido desde `/`) |

## Seam — `XrayProvider`

```ts
export const provider: XrayProvider = mockProvider; // ← única línea a cambiar
```

Métodos: `listCompanies`, `listGroups`, `listCompanySummaries`, `getScore`, `listActions`, `listProducts`, `getNegotiation`, `importCompanies`.

Cada bloque de datos lleva `origin: "ml" | "llm" | "eve" | "deterministic"`. La UI lo muestra como chip; al cablear sistemas reales, grepea `origin`.

**Regla:** ninguna pantalla ni componente de `components/xray/` importa `lib/xray/registry/`. Solo el provider.

El contrato de `ScoreSnapshot` espeja `docs/plan.md` §6. Zod en `web/lib/xray/schemas.ts`.

## Fórmulas

### Score / uplift (`scoring.ts`)

`score = Σ weight_d · dim_d · 100` con pesos liquidez 0.28, cobros 0.18, pagos 0.18, deuda 0.26, actividad 0.10.

`applyAction(snapshot, action, amount)` escala los `dimension_deltas` por `amount / recommended_amount` (tope 1.5×), clampea dims a [0,1], recompone score y banda. **La misma función** alimenta uplift de acción y de producto.

### Match bilateral (`match.ts`)

- `clientFit` = cobertura + coste vs deuda actual + plazo vs ciclo de caja + holgura DSCR
- `issuerAppetite` = banda vs apetito + ticket vs sweet spot + margen + cross-sell
- `match = 2·c·i / (c+i)` (media armónica; un 0 anula el deal)
- `solveIdealAmount` maximiza uplift con DSCR ≥ 1.2
- `issuerTerms` = términos más caros que el cliente aún acepta (clientFit ≥ 0.45). El hueco vs `client_ideal_terms` es la superficie de negociación.

### Import CSV (`csv.ts` + `mapping.ts`)

`readCsvPreview(file)` lee solo los primeros 64 KB. `suggestMapping` alinea cabeceras a los 9 datasets del diccionario. Trampas documentadas en UI: invoices sin `direction`, balances = foto final, `payment_date` falso en overdue.

## Cableado futuro

| Sistema | Borrar | Enchufar |
|---|---|---|
| **ML** (score/bands) | `registry/scores.ts` generación | `getScore` → `GET /score/{id}` FastAPI / `xray.score` |
| **API / DB** | `registry/companies.ts` estático | `listCompanies` → Supabase o FastAPI `/companies` |
| **Raw data** | mock import | `importCompanies` → pipeline que llame `xray.data.load()` + features |
| **LLM (AI SDK)** | textos de `actions.rationale`, levers `origin:llm` | generar rationale/levers con Vercel AI SDK; **nunca** recalcular cifras |
| **Eve agents** | chips `origin:eve` mock | tools Eve que lean el JSON del provider; chat en `/chat` |
| **Determinista** | nada — `scoring.ts` / `match.ts` se quedan | reutilizar tal cual desde Python o TS |

## Tests

```bash
cd web && npm test
```

Seis ficheros al seam: bands, scoring, match, csv, mapping, use-selection.
