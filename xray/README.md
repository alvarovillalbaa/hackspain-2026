# `xray/` — motor de financiabilidad

Last updated: 2026-09-20

Paquete Python 3.12 que **calcula** el Health Score. Lo consume `api/` (ingest) y `xray-export-web` (fact pack). **No** importa `api/` ni Node.

No uses este paquete para redactar narrativa ni cotizar ofertas: eso es Eve + TypeScript. No reimplementes el pipeline en un notebook.

## Módulos que importan los demás

| Módulo | Qué hace | CLI |
|---|---|---|
| `data` | Carga los 9 CSV, caché parquet, dirección de facturas | `xray-cache` |
| `features` | Tabla `features(company_id, month)` — **seam** | `xray-features` |
| `profile` | Rangos por mes: empresas nuevas vs referencia | — |
| `labels` | Rangos, índice, evento, etiqueta t+6 | — |
| `rules` | Nivel, mapa isotónico, outlook, trend, confidence | — |
| `events` | Watch desde CSV (cliente, vencimiento, deuda cara) | — |
| `explain` | Drivers exactos por señal; rollup de grupo | — |
| `evals` | AUC(h), lead time, persistencia, fiabilidad | `xray-evals` |
| `score` | Puntuador por lotes; `--extra` vs perfil | `xray-score` |
| `export_web` | `records_from_scored` → `web/lib/xray/dataset/` | `xray-export-web` |
| `unify` | CSVs subidos → tabla de features (ingest) | — |
| `projection` · `policies` | Simulador de caja y MPC (ficha `treasury`) | — |
| `demopacks` · `testsets` · `prescore` | Packs demo, QA, scores del wizard | `xray-demopacks`, … |

`adoption`, `eventstudy`, `behavior`, `ope` son experimentos de producto (pistas A/C). No alimentan el score de la demo.

## Quick start

```bash
uv sync --all-extras
uv run xray-cache && uv run xray-features && uv run xray-score && uv run xray-export-web
```

```python
from xray.data import load
from xray import features, rules

tx = load("transactions")
table = features.build()          # artifacts/features.parquet
```

## Contratos

1. Añadir columnas a `features` es libre; **renombrar o cambiar el grano no**.
2. Si cambia un campo del export, el mismo commit toca `records_from_scored`, `snapshotFromExported` y el Zod de `web/lib/xray/schemas.ts`.

Spec: [`../docs/specs/rules-spec.md`](../docs/specs/rules-spec.md), [`../docs/specs/features-seam.md`](../docs/specs/features-seam.md). Tests: [`../tests/README.md`](../tests/README.md).
