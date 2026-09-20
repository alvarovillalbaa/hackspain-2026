# Suite de tests — Python (xray + api)

Last updated: 2026-09-20

Layout canónico QA. Los tests **no** viven junto al código.

| Carpeta | Qué |
|---|---|
| `unit/` | Lógica pura del motor (`xray.*`) |
| `integration/` | Ingest, packs, export, filesystem |
| `adversarial/` | Inputs hostiles sobre nuestras APIs |
| `evals/` | Wrapper fino de suites de eval (skip si no hay config) |
| `regression/` | Defectos nombrados |
| `unit/legacy/` | `xray_score` / pipeline stdlib — marker `legacy`, fuera del gate |
| `fixtures/` | CSV mock del seam de features |
| `tmp/` | Scratch gitignored |

```bash
uv run pytest                              # default: not legacy, not evals
uv run pytest -m legacy                    # orphans
uv run pytest --cov=xray --cov=api --cov-fail-under=100
```

Tiers: T1/T2 en unit; T2/T3 en integration. Sin T5. Reproducir evals del score, e2e y calibración: [`../docs/runbooks/reproduccion.md`](../docs/runbooks/reproduccion.md).
