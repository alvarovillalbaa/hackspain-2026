# `artifacts/` — caché y modelos

Last updated: 2026-09-20

Salidas del motor. **Gitignored.** Se regeneran; no se editan a mano.

| Ruta | Origen |
|---|---|
| `raw/*.parquet` | `uv run xray-cache` |
| `features.parquet` | `uv run xray-features` |
| `scores/scores.parquet` | `uv run xray-score` |
| `scores/rules_model.json` | mapa isotónico congelado (API + ingest) |
| `evals/metrics.json` | `uv run xray-evals` |
| `calibration/` | salidas de `npm run calibrate` si se escriben aquí |

Override: `XRAY_ARTIFACTS_DIR`. Lo que **sí** va en git es el fact pack derivado (`web/lib/xray/dataset/`), no esta carpeta.

Reproducir: [`../docs/runbooks/reproduccion.md`](../docs/runbooks/reproduccion.md).
