<!--
Mantenimiento: este fichero se carga en cada sesión de cada agente. Menos de 120 líneas.
Cabe lo que el agente no puede deducir del código: convenciones, gotchas, contratos, límites.
Lo que se deduce mirando (estructura, dependencias, scripts) vive en README y pyproject/package.json.
web/AGENTS.md manda dentro de web/ (el más cercano gana); aquí no se repite nada de allí.
-->

# X Ray — instrucciones para agentes

Score de financiabilidad a 6 meses para pymes a partir de tesorería, y encima un producto de refinanciación para el asesor de Embat. Reto de HackSpain 2026 (18–20 sep). Decisiones cerradas en `docs/plan.md`; stack y contratos en `docs/tech_stack.md`; enunciado en `CONTEXTO_RETO.md`. Trabajo repartido en la épica #13 y los slices #1–#12 de GitHub: antes de implementar, lee el issue del slice.

## Mapa

| Ruta | Qué es | Lenguaje |
|---|---|---|
| `xray/` | El motor: `data` (carga + caché), `features` (contrato y `build()`), `profile`, `labels`, `rules`, `events`, `explain`, `evals`, `score`; pendientes `bands`, `rates` | Python 3.12, uv |
| `api/` | FastAPI de ingest (`GET /health`, `POST /ingest`); importa `xray`. El score de la demo es el fact pack, no `/score` | Python |
| `web/` | Next.js + agente Eve (fact pack + Blob). **Tiene su propio `AGENTS.md`: léelo antes de tocar nada ahí** | TypeScript |
| `notebooks/` | Experimentos compartidos; importan `xray`, sin outputs en git | — |
| `tests/` | pytest con fixtures de 3 filas; no necesita el dataset | Python |
| `docs/data/raw/`, `artifacts/` | Dataset crudo (645 MB, gitignored) y caché parquet. Fact pack en `web/lib/xray/dataset/*.json`. Packs demo importables en `docs/data/raw/new/` (sí en git). Catálogo marketplace: `product_catalog.json` | — |

## Comandos

```bash
uv sync --all-extras        # entorno Python completo
uv run xray-cache           # CSV → parquet (una vez; 30 s)
uv run xray-features        # tabla features(company_id, month) → artifacts/features.parquet (8 s)
uv run xray-evals           # métricas del score → artifacts/evals/metrics.json
uv run xray-score           # scores de todas las empresas → artifacts/scores/scores.parquet
uv run pytest               # verde antes de cada commit en xray/ api/ tests/
uv run xray-demopacks       # packs demo → docs/data/raw/new/ (group + update)
cd web && npm run typecheck # limpio desde el 19 sep; no añadas ningún error
cd web && npm test          # vitest sobre la lógica pura de lib/xray, hooks/xray y evals/lib
cd web && npm run calibrate # calibración agéntica Eve (N reps, CV/fidelidad ≤2 %; docs/calibration.md)
```

`npm run lint` arrastra 18 errores de `react-hooks/set-state-in-effect`, todos en
ficheros de la plantilla (`components/ai-elements/`, `components/ui/carousel.tsx`,
`hooks/use-mobile.ts`). No bloquean el build ni el deploy; no añadas ninguno nuevo
en código nuestro.

## Los dos seams — no los rompas sin avisar

1. **`features(company_id, month)`**: tabla plana mensual que leen `labels`, `rules`, `explain`, `evals` y `score`. Añadir columnas es libre; renombrar o cambiar el grano no.
2. **JSON de ficha (`ScoreSnapshot`)** (`web/lib/xray/schemas.ts`): el GET vive en Next (`/api/xray/score/{id}`), desde `scores.json` (`xray-export-web`) o ingest. Si cambias un campo, en el mismo commit: `records_from_scored`, `snapshotFromExported` y Zod. `docs/plan.md` §6 es el diseño del viernes, no el runtime.

## Hechos del dataset que ningún fichero confiesa

- Las facturas **no traen dirección**: `amount < 0` es recibida, `> 0` emitida. `xray.data.load()` ya añade `direction`.
- En facturas `status == "overdue"`, `payment_date` **no es una fecha de pago** (coincide con `due_date` en el 96%). El retraso a proveedores se mide con `pending_amount` y `due_date`.
- `balances.csv` es solo la foto final (2026-09-01). El saldo histórico se reconstruye hacia atrás con las transacciones.
- No hay campo sector; `country` está relleno al 18%. Los pares se definen por tamaño y patrón de flujos.
- Solo 378 de 1.286 empresas tienen deuda; 87 contratos en `debt_schedule_config`. La curva de tipos no sale del dataset (`docs/tech_stack.md` §5.1).
- La reconstrucción de saldo hacia atrás **deriva**: la proporción de cuentas en negativo cae del 10% al 2% hacia la foto final, también en cohorte fija y solo con `booked`. Señales de saldo como rango percentil dentro del mes para etiqueta y modelo; euros en bruto solo en pantalla (`docs/plan.md` §5).
- `interest_charge` **no es el interés de los préstamos** (coste implícito mediana 0,3% frente a 3% en contratos). El coste de la deuda sale de `debt_schedule_config` o del tipo implícito de la anualidad en `xray/rates`.
- Carga siempre con `xray.data.load()`: aplica lo anterior y usa la caché parquet (1 s frente a 30 s).
- `exchange_rate` **no convierte moneda** (vale 1,0 en el 90 % de los movimientos de las 137 empresas no-EUR): las columnas en euros de esas empresas están en su moneda; las cuatro señales del índice son ratios y no les afecta.
- El 15 % de las facturas recibidas **no son facturas** (`document_type` de pago, nota, depósito, albarán) y el 2 % están canceladas: `features.invoice_rows()` las quita antes de cualquier cálculo.
- `2026-09` tiene **un solo día** de movimientos: la tabla de features termina en 2026-08. Las 21 empresas sin cuenta corriente con saldo en `balances.csv` quedan fuera de la tabla.

## Límites

- **El LLM nunca calcula.** Score y features son deterministas en Python; Eve redacta sobre el JSON del fact pack / tools / ingest. Toda cifra que emita debe existir ahí. El uplift del marketplace es otro 0–100 en TypeScript (`scoring.ts`), no el mapa isotónico. El subagente `offering` **cotiza términos** sobre `product_catalog.json`; no inventa productos.
- **`xray/score.py` no importa `api/` ni nada de Node.** Embat no tiene script de scoring (19 sep): `xray-score` produce la tabla; `xray-export-web` el `scores.json` de la demo; `POST /ingest` puntúa CSVs contra el `RulesModel` congelado.
- **Los notebooks importan `xray`.** Una función que se reutiliza se mueve a `xray/` y se importa; el notebook no es la fuente de verdad.
- **Datos públicos web (slice #1) producen campos de perfil, jamás un score.**
- Secretos en `.env*` (ignorado) y variables de entorno; nunca en código ni en notebooks.

## Convenciones

- Código, identificadores y nombres de columna en **inglés**; docs, issues y mensajes de commit en **español**.
- Commits en imperativo, primera línea < 72 caracteres, cuerpo con el porqué. Cita el slice (`#4`) cuando aplique.
- Rutas con `pathlib` y a través de `XRAY_DATA_DIR` / `XRAY_ARTIFACTS_DIR`; el equipo mezcla Windows y macOS. Por defecto `xray.data` lee `docs/data/raw` si existe; si no, `input_data/`.
- Persistencia demo: JSON en git (`web/lib/xray/dataset/`) + Vercel Blob para imports/recomendaciones. Sin Postgres para el score.
- Tests al seam, no a la implementación: dada una tabla de features fixture, el resultado esperado; sin tests de parseo interno.
- Una decisión que cambie `docs/plan.md` o `docs/tech_stack.md` se anota allí con fecha en el mismo PR.

## Cuándo leer qué

- Vas a tocar el score, el evento o las bandas → `docs/rules_spec.md` (la especificación viva; §11 las decisiones del 19 sep), `docs/plan.md` §2 y la evidencia en `docs/investigacion_score.md` §7–§8.
- Vas a *mejorar* el score (no solo tocarlo) → `docs/auditoria_health_score.md`: cómo se calcula de punta a punta, los seis defectos medidos (sesgo por ERP, bandas colapsadas, el índice rinde peor que su mejor señal sola) y el plan priorizado. Incluye tres callejones sin salida ya descartados con datos: no los repitas.
- Vas a tocar la tabla de features → `docs/features_seam.md` (contrato y decisiones del builder).
- Necesitas saber qué asume el modelo, cómo se calibra o qué significa el número → `docs/model_card.md` (ficha del modelo: supuestos con su chequeo y cifras).
- Tienes que explicarlo sin tecnicismos → `docs/MODEL_toni.md` y `docs/sistema_en_cinco_figuras.html`.
- Vas a elegir una librería o desplegar algo → `docs/tech_stack.md` §5 y §9 (riesgos) antes de añadir dependencias.
- Vas a tocar `web/` → `web/AGENTS.md` y los docs de Eve que indica.
- Vas a medir varianza / fidelidad del agente Eve (no el AUC del score) → `docs/calibration.md` y `web/evals/calibration/`.
- Cómo está cableado hoy (ingest, fact pack, Eve, dos scores) → `docs/auditoria_plataforma.md`.
- No sabes qué hacer → el slice abierto de tu área en GitHub; si no hay, pregunta antes de abrir uno nuevo.
