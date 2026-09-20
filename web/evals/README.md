# `web/evals/` — calibración y suites Eve

Last updated: 2026-09-20

Evals del agente (repetibilidad, fidelidad, grounding) y la suite **never-calculate**. No sustituyen a `uv run xray-evals` (métricas del Health Score).

| Ruta | Qué |
|---|---|
| `calibration/` | Suites `eve eval` (analista, orquestador) |
| `suites/never-calculate.spec.json` | El LLM no inventa cifras |
| `data/` | Manifest y jsonl |
| `lib/` | Extraer números, CV, grounding |

```bash
npm run calibrate            # eve eval calibration --strict
```

Tests sin LLM: `web/tests/unit/evals/` y `web/tests/evals/`. Spec: [`../../docs/runbooks/calibration.md`](../../docs/runbooks/calibration.md).
