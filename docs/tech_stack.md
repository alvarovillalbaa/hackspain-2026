# Tech stack — PRD técnico de X Ray

> Versión 1 · 18 sep 2026 · Complementa a [`plan.md`](plan.md) (qué construimos) con **con qué y por qué**. Cambios de stack se anotan aquí con fecha.

## 1. Problema que resuelve este documento

Cinco personas, tres runtimes (Python, Node, navegador) y 48 horas. Sin un stack fijado, cada uno elige herramientas distintas, los notebooks no se pueden reproducir, el front espera al modelo y la demo del domingo se monta a mano. Este documento fija **qué herramienta hace qué**, **cómo se hablan entre sí** y **qué no vamos a usar**, para que nadie tenga que decidirlo el sábado a las tres de la mañana.

## 2. Objetivos

| Objetivo | Cómo se mide |
|---|---|
| Cualquier miembro reproduce el entorno completo en < 10 minutos | `uv sync` + `npm install` desde clon limpio, sin pasos manuales |
| Front y motor avanzan en paralelo desde el viernes | Stubs de la API con el contrato JSON antes de tener un solo número real |
| Un notebook nunca reimplementa el pipeline | Todo lo reutilizable vive en `xray/` y se importa |
| El leaderboard no depende de la web | `score.py` corre sin FastAPI, sin Node, sin Supabase |
| La demo se abre desde una URL, no desde un portátil | Desplegada en Vercel el sábado por la noche |

## 3. No-objetivos

- **No** elegimos infraestructura de producción (Kubernetes, colas, data warehouse). Es un fin de semana; lo que se despliega es Vercel + un proceso Python.
- **No** hay autenticación real ni multi-tenant. Un usuario (el asesor de Embat), una cartera.
- **No** entrenamos modelos profundos ni usamos GPU. GBM ligero + reglas; la evidencia dice que un modelo sencillo con producto claro gana.
- **No** hay pipeline de datos en streaming. Los 9 CSV son estáticos; se cachean una vez.
- **No** usamos el LLM para calcular nada. Solo redacta y recomienda sobre JSON estructurado.

## 4. Vista general

```
docs/data/raw/ (CSV)  ──►  xray (Python)  ──►  api (FastAPI)  ──►  web (Next.js + Eve)  ──►  asesor
                              │
                              └──►  web/lib/xray/dataset/*.json (fact pack en git) + Blob (imports/recs)
                              │
                              └──►  score.py  ──►  leaderboard de Embat
```

Dos *seams* mantienen las piezas desacopladas: la tabla `features(company_id, month)` (dentro de Python) y el contrato JSON de `/score` (entre Python y web). Todo lo demás puede cambiar sin avisar al vecino.

## 5. Stack por capa

### 5.1 Motor analítico — `xray/`

| Componente | Elección | Por qué | Alternativa descartada |
|---|---|---|---|
| Lenguaje / versión | **Python 3.12** (fijado en `.python-version`) | Wheels de LightGBM y SHAP garantizados; 3.14 (el del sistema) aún no los tiene | 3.14 del sistema |
| Gestor de entorno | **uv** con `pyproject.toml` + `uv.lock` | Resolución en segundos, instala el intérprete, un solo comando para todos; el lock garantiza el mismo entorno en cinco portátiles | pip + venv (sin lock), conda (lento, pesado) |
| Empaquetado | Paquete instalable `xray` (hatchling), layout plano | `import xray` desde cualquier notebook o repo personal; `uv add xray @ git+…` | Scripts sueltos con `sys.path` |
| Dataframes | **pandas 3 + pyarrow** | El equipo lo conoce; parquet vía arrow reduce la carga de `transactions` de 30 s a ~1 s | polars (más rápido, menos conocido; se puede introducir en features si hace falta) |
| Modelo | **LightGBM** (+ scikit-learn para splits, métricas, calibración), como **retador** del score por reglas (plan §4 y §9, 18 sep noche) | Tabular, pocos datos, entrena en segundos, maneja nulos nativamente (historiales cortos) | XGBoost (equivalente), redes (sin justificación con 1.286 empresas) |
| Explicabilidad | **SHAP** (TreeExplainer) | Contribución por feature y por empresa-mes → `drivers` del contrato JSON; exacto y rápido en árboles | LIME (aproximado, más lento) |
| Simulación | numpy (Monte Carlo propio) | La proyección de caja es un bucle vectorizado; no necesita librería | PyMC/statsmodels (sobredimensionados) |
| Tests | **pytest** con fixtures mínimas en `tests/` (CSV de 3 filas) | Corren sin el dataset; validan los hechos del dataset (dirección de factura, fechas basura, caché) | — |
| Lint | ruff | Un binario, sin configuración | black + flake8 + isort |

**Caché de datos.** `xray.data.load()` resuelve `XRAY_DATA_DIR` → `docs/data/raw/` (si existe) → `input_data/`, convierte a parquet en `artifacts/raw/` y aplica la limpieza documentada en `plan.md` §5. `uv run xray-cache` la construye de una vez. `artifacts/` está fuera de git. Persistencia mutable en Vercel: Blob (`BLOB_READ_WRITE_TOKEN`), no reescritura del fact pack ni Postgres.

### 5.2 API — `api/` (slice #8)

| Componente | Elección | Por qué |
|---|---|---|
| Framework | **FastAPI + uvicorn** | Pydantic valida el contrato JSON en ambos sentidos; OpenAPI gratis para que el front y el agente Eve vean el esquema; async para no bloquear con el LLM |
| Esquemas | **pydantic v2** | Los mismos modelos sirven de contrato, de validación de tests y de documentación |
| Modo stub | Flag `XRAY_STUB=1` devuelve datos ficticios que cumplen el contrato | Front y agente arrancan el viernes sin esperar al modelo |
| Servido | Local durante el hackathon (`uv run xray-api` / `uvicorn api.main:app`); túnel (ngrok/cloudflared) para que el deploy de Vercel alcance `XRAY_API_URL` | Desplegar Python en Vercel es posible pero añade riesgo; decisión 19 sep: local + túnel |
| Ingest | `POST /ingest` (multipart CSVs + mappings) unifica por empresa, puntúa con `rules_model.json` + `rank_against=profile`, devuelve el mismo shape que `scores.json` | Wizard de importación en `web/`; persistencia en Vercel Blob (`xray/imports/`) |

La API **importa** `xray`; nunca al revés. `score.py` no importa `api`. Arranque: `uv run xray-score` una vez para generar `artifacts/scores/rules_model.json`, luego `uv run xray-api`. Datasets de QA: `uv run xray-testsets` → `docs/data/raw/qa/`. Packs de demo: `uv run xray-demopacks` → `docs/data/raw/new/`.

### 5.3 Web — `web/` (slices #9, #10)

Plantilla `ai-app-jumpstart` movida intacta a `web/`. Versiones instaladas:

| Componente | Versión | Papel |
|---|---|---|
| **Next.js** (App Router) | 16.3.5 | Front del asesor: monitor → ficha → refinanciación → what-if |
| **React** | 19.2 | — |
| **Eve** (`eve/next`, `eve/react`) | 0.54.5 | Agente de explicación y recomendación, montado en `/eve/v1/*` por `withEve()`; mismo deploy que la web |
| **Vercel AI SDK** (`ai`) | 7.0.99 | Streaming y tipos de mensaje en la UI de chat |
| **Supabase** (`supabase-js`, `ssr`) | 2.116 / 0.12.7 | **Deps de plantilla; 0 uso en producto** (19 sep). Persistencia demo = Vercel Blob JSON |
| **Vercel Blob** (`@vercel/blob`) | — | Session/grupo, imports, recommendations Eve, actions ficha, deals, alerts |
| **Tailwind 4 + shadcn (base-ui)** | — | Componentes; `components/ai-elements` trae chat, citas, planes |
| **Recharts** | 3.8 | Trayectoria 24 m, descomposición por dimensión, intervalos de la proyección |
| **@xyflow/react** | 12 | Disponible para un grafo de contrapartes si sobra tiempo; no es P0 |
| **zod** | 4.6 | Validar en el cliente lo que llega de FastAPI (espejo de pydantic) |
| **TypeScript** | 5 | `npm run typecheck` |
| Despliegue | **Vercel**, *Root Directory* = `web` | Un `git push` = demo actualizada |

**Papel del agente Eve.** Recibe la pregunta del asesor, llama a tools sobre el fact pack / Blob y redacta **solo** sobre el JSON devuelto. Guardia: ninguna cifra en la respuesta que no exista en el input.

**Papel de Blob (19 sep).** Sustituye Postgres/Supabase para la demo live: un `xray/session.json` compartido fija el grupo del portfolio (`/start`); imports, deals, títulos Eve y recomendaciones sobreviven reload. El fact pack scored sigue en git.

### 5.4 Experimentación — `notebooks/` y repos personales

| Componente | Elección | Por qué |
|---|---|---|
| Entorno | JupyterLab del extra `notebooks` de uv | Mismo kernel que el paquete; `from xray.data import load` |
| Outputs en git | **nbstripout** vía `.gitattributes` (activar con `uv run nbstripout --install`) | Sin diffs de 20 MB ni conflictos de merge |
| Repos personales | `uv add "xray @ git+https://github.com/alvarovillalbaa/hackspain-2026"` + `XRAY_DATA_DIR` | Scratch fuera del repo del equipo; lo que se comparte vuelve como código en `xray/` o notebook en `notebooks/` |
| Gráficos | matplotlib / seaborn | Para el notebook; en la web se usa Recharts |

### 5.5 Extracción de perfil público — slice #1

| Componente | Elección | Por qué |
|---|---|---|
| Runtime | Python, dentro de `xray/` (módulo `profiles`) | Su salida (JSONL) se une a `features` por `company_id` |
| HTTP + caché | `httpx` + caché en disco por hash de URL | Reejecuciones sin red |
| LLM de extracción | Anthropic SDK, modelo clase Sonnet, salida estructurada, temperatura 0 | Solo normaliza texto a campos; nunca produce score |
| Fuentes | BORME (datos abiertos BOE), Wikidata, web propia, API de búsqueda | Sin LinkedIn ni registros de pago |

### 5.6 Herramientas transversales

| Qué | Elección |
|---|---|
| Control de versiones | GitHub `alvarovillalbaa/hackspain-2026`, rama `main`, épica #13 y slices #1–#12 |
| Formato de línea | `.gitattributes` con `eol=lf`; Windows y macOS conviven |
| Secretos | `.env*` ignorado; cada uno rellena `web/.env.local` y variables de shell para Python |
| Datos | `input_data/`, `dataset/`, `*.csv` (salvo `tests/**`) y `artifacts/` fuera de git |

## 6. Contratos de integración

### 6.1 `features(company_id, month)` — dentro de Python

Tabla plana mensual, una fila por empresa y mes, con las cinco dimensiones (liquidez, cobro, pago, deuda, actividad) y columnas estáticas del perfil público. La produce `features.build()` (`uv run xray-features`, 8 s); la consumen `labels`, `rules`, `explain`, `evals` y `score`. Se cachea en `artifacts/features.parquet`.

### 6.2 API JSON — entre Python y web

Endpoints: `GET /companies` · `GET /score/{company_id}` · `GET /debt/{company_id}` · `POST /whatif` · `GET /explain/{company_id}`.

```json
{
  "company_id": "…", "month": "2026-09",
  "score": 62.4, "band": "BB", "outlook": "negative", "trend": "worsening", "watch": null,
  "sub_scores": {"bankability": 58, "business_profile": 71},
  "dimensions": {"liquidity": 0.4, "collections": 0.7, "payments": 0.3, "debt": 0.5, "activity": 0.6},
  "peer_percentile": 41,
  "projection_6m": {"p10": 48.0, "p50": 57.5, "p90": 66.0},
  "history": [{"month": "2024-10", "score": 70.1}],
  "drivers": [{"signal": "credit_line_usage", "delta": -6.2, "since": "2026-03"}],
  "alerts": [],
  "explanation": null
}
```

Reglas: pydantic lo valida al salir, zod al entrar; `explanation` llega por `/explain` en segunda llamada para que el LLM no bloquee la ficha; cualquier cambio de contrato se anuncia en el canal del equipo y se refleja en los stubs el mismo momento.

### 6.3 Herramientas del agente Eve — entre web y API

`get_score(company_id)`, `get_debt(company_id)`, `run_whatif(company_id, scenario)` → llamadas HTTP a FastAPI. El agente no tiene acceso al dataset ni a `xray`; solo ve JSON.

### 6.4 Leaderboard — entre Python y Embat

`uv run python -m xray.score --data <dir_test_oculto> --out predicciones.csv`. El formato de salida vive en una función aislada para adaptarlo en una hora cuando llegue el script de scoring.

## 7. Configuración y variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `XRAY_DATA_DIR` | shell (Python) | Carpeta con los CSV; por defecto `docs/data/raw/` si existe, si no `input_data/` |
| `XRAY_ARTIFACTS_DIR` | shell (Python) | Caché parquet y modelos; por defecto `artifacts/` |
| `XRAY_STUB` | API | `1` → respuestas ficticias con el contrato |
| `ANTHROPIC_API_KEY` | shell (Python, slice #1) | Extracción de perfil público |
| `XRAY_API_URL` | `web/.env.local` | URL de FastAPI para las herramientas del agente |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `web/.env.local` | Cliente Supabase |
| Clave del modelo del agente Eve | `web/.env.local` | Ver pregunta abierta 1 |

## 8. Requisitos

### P0 — sin esto no hay demo

- [ ] `uv sync --all-extras` y `npm install` funcionan desde clon limpio en Windows y macOS.
- [ ] `uv run xray-cache` construye la caché; `load("transactions")` < 3 s desde caché.
- [ ] API en modo stub sirve los cinco endpoints con el contrato §6.2 el viernes por la noche.
- [x] `xray-score` produce la tabla de scores de todas las empresas sin importar `api` ni nada de Node (19 sep; el leaderboard ya no aplica).
- [ ] Web desplegada en Vercel con *Root Directory* `web`; las cuatro pantallas navegan contra la API.
- [ ] El agente Eve responde solo con cifras presentes en el JSON de entrada (test adversarial).
- [ ] `uv run pytest` en verde; `npm run typecheck` en verde tras arreglar o eliminar los componentes rotos de la plantilla.

### P1 — mejora clara, no bloquea

- [ ] Supabase persiste watchlist y explicaciones entre recargas.
- [ ] FastAPI accesible públicamente (túnel o PaaS) para que la demo no dependa de un portátil.
- [ ] nbstripout activado en los cinco clones.
- [ ] Perfil público de las 2–3 empresas de demo integrado en `features`.

### P2 — diseñar para no cerrar la puerta

- Sustituir pandas por polars en `features` si la construcción supera 2 minutos.
- Ejecutar `score.py` como job programado (monitor mensual) — el bonus "monitor que avisa" en producción.
- Multi-usuario en Supabase (RLS por asesor).

## 9. Riesgos del stack y mitigación

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| La plantilla `web/` no compila: 18 errores de tipos en `components/ai-elements` (base-ui) + `LayoutProps` | **Ya ocurre** | Full-stack, viernes: arreglar versiones de `@base-ui/react` o borrar los componentes no usados; `next dev` genera `LayoutProps`. **(19 sep, tarde)** `next build` falla por lo mismo, así que Vercel no despliega ningún commit, tampoco `main`; `web/vercel.json` omite el despliegue cuando el commit no toca `web/` para que las PR de Python no salgan en rojo. El arreglo (pinear `@base-ui/react`, borrar los componentes no usados o `typescript.ignoreBuildErrors` como parche de fin de semana) sigue en el slice del front y bloquea el P0 «web desplegada». |
| El modelo del agente Eve (`openai/gpt-5.6-luna-fast` en la plantilla) necesita una clave/gateway que no tenemos | Alta | Decidir modelo y proveedor el viernes (pregunta abierta 1); el fallback es la explicación por plantilla en Python |
| Python en Vercel para la API | Media | No intentarlo; API local + túnel, o Render/Fly con Dockerfile de 10 líneas |
| Windows vs macOS: rutas, `eol`, wheels | Media | `.gitattributes` con LF; uv resuelve wheels por plataforma; rutas siempre vía `pathlib` y `XRAY_DATA_DIR` |
| Alguien commitea el dataset crudo | Baja tras el `.gitignore` | `*.csv` ignorado salvo `tests/**`; `/input_data/`, `/dataset/`, `/docs/data/`, `/artifacts/` anclados a la raíz. El fact pack derivado `web/lib/xray/dataset/*.json` **sí** va en git (necesario para el build de Vercel). |
| El script de scoring pide otro formato | Alta | Formato aislado en una función de `score.py` |
| Supabase sin esquema el domingo | Media | Esquema mínimo de tres tablas el sábado; si no llega, la demo funciona sin persistencia (P1, no P0) |

## 10. Preguntas abiertas

1. **Modelo y proveedor del agente Eve** *(full-stack, bloqueante para #9)*: la plantilla trae `openai/gpt-5.6-luna-fast` vía gateway. ¿Tenemos clave? ¿Cambiamos a Claude (coherente con el extractor del slice #1)? Decidir el viernes.
2. **¿Dónde corre FastAPI en la demo?** *(full-stack + ML-1, sábado 18:00)*: local + túnel vs. PaaS. Depende de si la demo se presenta desde nuestro portátil.
3. **Esquema Supabase mínimo** *(full-stack, sábado mañana)*: confirmar las tres tablas o reducir a una.
4. **Formato del leaderboard** *(ML-1, cuando llegue el script de Embat)*. **Cerrada el 19 sep:** Embat no tiene script de scoring ni leaderboard; `xray-score` escribe la tabla de scores para la API y el monitor y el formato vive en `_write_table` por si cambia.
5. **¿Polars en `features`?** *(ML-1, solo si la construcción tarda > 2 min)*. **Cerrada el 19 sep (tarde):** `features.build()` en pandas sobre la caché parquet tarda 8 s para las 1.265 empresas; no hace falta polars. La rama `codex/treasury-resilience-score` (builder en polars, paquete aparte con su propio `pyproject.toml` / `uv.lock` / `main.py`) **no se fusiona y no se borra**: queda como referencia. `xray/` ya absorbió lo útil (filtro de facturas, perfil de referencia guardado); se descartaron la normalización por `exchange_rate` (no es una conversión, plan §5) y el perfil global de percentiles (sensible a la deriva del saldo). Fusionarla verbatim rompería el `uv sync` del root.
6. **Calibración de los pesos del índice de estado** *(ML-2, domingo 10:00; añadida el 18 sep, noche)*: la v1 usa pesos fijos por el orden de evidencia del plan §2 y un único mapa isotónico del índice suavizado al índice realizado a t+6. Candidato para después: búsqueda de pesos que maximice el Spearman con el índice a t+6 en los meses de train, **restringida a ese orden de evidencia**, para que siga siendo «reglas calibradas» y no una regresión con otro nombre. Si la restricción cuesta mucha correlación, se dice en el pitch. **Resuelta el 19 sep (mañana):** pesos iguales pierden 0,008 de AUC(6) frente a los del plan; no se calibran. Consecuencia: el mapa isotónico es monótono y ningún parámetro ajustado mueve el ranking, así que GroupKFold se reporta como dispersión entre subpoblaciones, no como generalización (`rules_spec.md` §8 y §11).

## 11. Calendario del stack

| Cuándo | Qué debe estar |
|---|---|
| Viernes noche | Entorno reproducible (hecho); stubs de la API con el contrato; `web` compilando; decisión de modelo del agente |
| Sábado mañana | `features.parquet` real; API sirviendo datos reales en al menos `/score`; esquema Supabase |
| Sábado 18:00 | Revisión: ¿API pública o local? ¿Supabase sí o no? Plan B activado donde toque |
| Domingo 10:00 | Congelación; despliegue final en Vercel; `score.py` entregado |
