# Reproducir X Ray

Last updated: 2026-09-20

Cómo clonar, regenerar scores y pasar tests. El README raíz resume; aquí están las trampas.

El dataset (~645 MB) **no va en git**. Colócalo en `data/raw/` o `export XRAY_DATA_DIR=/ruta/a/los/csv`. Inventario: [`../../data/README.md`](../../data/README.md).

## Local — motor

Python **3.12** (`.python-version`). `uv` instala el intérprete.

```bash
uv sync --all-extras
uv run xray-cache          # CSV → artifacts/raw/*.parquet (~30 s, una vez)
```

Tras la caché, `from xray.data import load` tarda ~1 s en `transactions` en vez de ~30. Resolución: `XRAY_DATA_DIR` → `data/raw/` (si existe `companies.csv`) → `input_data/`.

Sin los CSV, el paquete y `uv run pytest` siguen vivos (fixtures en `tests/`). El fact pack de la web **sí** está en git: la demo no espera al dump.

## Local — web

Node **24** (`web/package.json` → `engines`).

```bash
cd web
cp .env.example .env.local   # rellena claves
npm install
npm run dev                  # Next + Eve en el mismo proceso
```

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` | Eve (Helmcode). Sin ella el chat/marketplace falla cerrado. |
| `AI_GATEWAY_API_KEY` / OIDC | AI SDK (explain). Failover a Helmcode. |
| `XRAY_API_URL` | Ingest CSV → `uv run xray-api` (default `http://127.0.0.1:8000`) |
| `BLOB_READ_WRITE_TOKEN` | Persistencia durable en Vercel |
| `SLACK_WEBHOOK_URL` | Alertas del watcher |
| `XRAY_DATA_DIR` | Al regenerar el fact pack |

Detalle LLM: [`ai-runtime.md`](ai-runtime.md). En Vercel, *Root Directory* = `web`.

Ingest en otra terminal:

```bash
uv run xray-score            # genera artifacts/scores/rules_model.json si no existe
uv run xray-api              # GET /health · POST /ingest
```

## Resultados (números del método)

Hace falta el dump en `data/raw/`.

```bash
uv run xray-cache
uv run xray-features         # artifacts/features.parquet (~8 s)
uv run xray-score            # artifacts/scores/scores.parquet + rules_model.json
uv run xray-evals            # artifacts/evals/metrics.json
uv run xray-export-web       # web/lib/xray/dataset/scores.json + metrics.json
cd web && npm run build:facts
```

Empresas nuevas contra el perfil de referencia (no contra el propio lote):

```bash
uv run xray-score --features artifacts/features.parquet \
  --extra nuevas.parquet --model artifacts/scores/rules_model.json
```

Packs de demo e import:

```bash
uv run xray-demopacks        # → data/packs/
uv run xray-prescore-packs   # scores precomputados para el wizard
```

Tablero HTML de evals: [`../results/dashboard_resultados.html`](../results/dashboard_resultados.html). Qué significa cada cifra: [`../references/model-card.md`](../references/model-card.md).

Notebooks (importan `xray`, no reimplementan el pipeline): [`../../notebooks/README.md`](../../notebooks/README.md).

```bash
uv run nbstripout --install  # una vez por clon
uv run jupyter lab
```

Desde otro repo: `uv add "xray @ git+https://github.com/alvarovillalbaa/hackspain-2026"` y `XRAY_DATA_DIR`.

## Tests

```bash
# Python — markers: not legacy, not evals
uv run pytest
uv run pytest --cov=xray --cov=api --cov-report=term-missing
uv run pytest -m legacy      # src/xray_score y amigos; fuera del gate
uv run pytest -m evals       # wrapper de suites; skip si no hay config

cd web
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run calibrate            # Eve, N reps, CV/fidelidad ≤ 2 %; hace falta clave
```

CI en [`.github/workflows/test.yml`](../../.github/workflows/test.yml): pytest con un `rules_model` de fixture + typecheck + vitest coverage. No corre Playwright ni `xray-evals` sobre el dump.

`fail_under` Python vive en `pyproject.toml` (omite `demopacks`/`testsets`). Layout: [`../../tests/README.md`](../../tests/README.md), [`../../web/tests/README.md`](../../web/tests/README.md). Calibración: [`calibration.md`](calibration.md).
