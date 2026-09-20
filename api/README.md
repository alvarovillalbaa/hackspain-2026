# `api/` — ingest FastAPI

Last updated: 2026-09-20

Proceso Python que puntúa **CSVs subidos** contra el `RulesModel` congelado. Importa `xray`. `xray` **no** importa `api`.

No uses esta API para servir la ficha de la demo: esa lee el fact pack en Next (`GET /api/xray/score/{id}`). No hay `GET /score`.

## Endpoints

| Método | Ruta | Qué |
|---|---|---|
| `GET` | `/health` | Modelo cargado + nº de empresas de referencia |
| `POST` | `/ingest` | Multipart CSVs + mappings JSON → scores + companies + summary |

Arranque:

```bash
uv run xray-score            # artifacts/scores/rules_model.json
uv run xray-api              # uvicorn api.main:app — puerto 8000
# o: uv run uvicorn api.main:app --reload --port 8000
```

La web apunta aquí con `XRAY_API_URL`. En Vercel hace falta un túnel; el Python no se despliega en el mismo proyecto.

Overrides: `XRAY_RULES_MODEL`, `XRAY_REF_SCORES`. Stub de contrato (front el viernes): `XRAY_STUB=1`.

Tests de ingest: `tests/integration/test_ingest_api.py`. Unify: `xray.unify`.
