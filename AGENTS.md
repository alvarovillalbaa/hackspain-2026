<!--
Mantenimiento: este fichero se carga en cada sesión de cada agente. Menos de 120 líneas.
Cabe lo que el agente no puede deducir del código: convenciones, gotchas, contratos, límites.
Lo que se deduce mirando (estructura, dependencias, scripts) vive en README y pyproject/package.json.
web/AGENTS.md manda dentro de web/ (el más cercano gana); aquí no se repite nada de allí.
-->

# X Ray — instrucciones para agentes

Score de financiabilidad a 6 meses para pymes a partir de tesorería, y encima un producto de refinanciación para el asesor de Embat. Reto de HackSpain 2026 (18–20 sep). Decisiones cerradas en `docs/plans/2026-09-18-xray-hackathon.md`; stack en `docs/references/tech-stack.md`; enunciado en `CONTEXTO_RETO.md`. Índice docs: `docs/knowledge/map.md`. Pitch y reproducción: `README.md`. Cada paquete tiene README in-folder.

## Mapa

| Ruta | Qué es | Lenguaje |
|---|---|---|
| `xray/` | Motor. README in-folder | Python 3.12, uv |
| `api/` | FastAPI ingest (`GET /health`, `POST /ingest`) | Python |
| `web/` | Next.js + Eve. **Lee `web/AGENTS.md` y `web/README.md`** | TypeScript |
| `notebooks/` | Experimentos; importan `xray` | — |
| `tests/` | pytest canónico (`unit/`, `integration/`, …) — no junto al código | Python |
| `web/tests/` | vitest + Playwright — no junto al código | TypeScript |
| `data/raw/`, `data/packs/`, `artifacts/` | Dump 645 MB (gitignored), packs demo (git), caché parquet. Fact pack: `web/lib/xray/dataset/` | — |

## Comandos

```bash
uv sync --all-extras
uv run xray-cache && uv run xray-features && uv run xray-score && uv run xray-export-web
uv run pytest                              # not legacy, not evals
uv run pytest --cov=xray --cov=api         # fail_under 90 (omit demopacks/testsets)
uv run xray-demopacks                      # → data/packs/
cd web && npm run typecheck && npm test && npm run test:coverage
cd web && npm run test:e2e                 # Playwright (Node 24; arranca next)
cd web && npm run calibrate                # Eve CV/fidelidad ≤2 %; docs/runbooks/calibration.md
```

`npm run lint` arrastra errores de plantilla (`components/ai-elements/`, …); no añadas nuevos en código nuestro.

## Los dos seams — no los rompas sin avisar

1. **`features(company_id, month)`** — añadir columnas libre; renombrar/grano no.
2. **`ScoreSnapshot`** (`web/lib/xray/schemas.ts`) — si cambias un campo: `records_from_scored`, `snapshotFromExported` y Zod en el mismo commit.

## Hechos del dataset (resumen)

Facturas sin dirección (`amount` signo); `overdue.payment_date` no es pago real; `balances.csv` solo foto final; sin sector; `interest_charge` ≠ interés de préstamos; cargar con `xray.data.load()`; features terminan en 2026-08. Detalle en `docs/knowledge/map.md` → audits/research.

## Límites

- **El LLM nunca calcula.** Score/features en Python; uplift marketplace en TS (`scoring.ts`). `offering` cotiza sobre `product_catalog.json`.
- **`xray/score.py` no importa `api/`.**
- Notebooks importan `xray`; no son fuente de verdad.
- Secretos solo en `.env*`.

## Convenciones

- Código/ids/columnas en **inglés**; docs/commits en **español**.
- Commits imperativo, < 72 chars; cita slice (`#4`).
- Datos: `XRAY_DATA_DIR` → `data/raw` → `input_data/`. Packs: `data/packs/`.
- Tests bajo `tests/` o `web/tests/` (nunca colocados). Docs AFS bajo `docs/<surface>/` (nada suelto en `docs/`).

## Cuándo leer qué

- Score / bandas → `docs/specs/rules-spec.md`, `docs/plans/2026-09-18-xray-hackathon.md` §2, `docs/research/investigacion-score.md`
- Mejorar el score → `docs/audits/2026-09-20-auditoria-health-score.md`
- Features → `docs/specs/features-seam.md`
- Model card → `docs/references/model-card.md`
- Sin tecnicismos → `docs/knowledge/MODEL_toni.md`
- Stack → `docs/references/tech-stack.md`
- Web → `web/AGENTS.md` · mapa humano `web/README.md`
- Reproducir local / evals / tests → `docs/runbooks/reproduccion.md`
- Calibración Eve → `docs/runbooks/calibration.md`
- Runtime → `docs/audits/2026-09-20-auditoria-plataforma.md`
- Campos / mocks → `docs/audits/2026-09-20-auditoria-flujo-datos.md`
- Mapa completo → `docs/knowledge/map.md`
