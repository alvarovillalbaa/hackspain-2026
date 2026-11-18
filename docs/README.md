# Mapa de documentación

Last updated: 2026-10-10

Índice humano del shell AFS bajo `docs/`. REFERENCES.md, SOURCES.md y GAPS.md en la raíz del repositorio son los catálogos de navegación, procedencia y límites.

| Necesitas | Ve a |
|---|---|
| Pitch, valor, reto, historial | [`../../README.md`](../README.md) |
| Enunciado del reto | [`../../CONTEXTO_RETO.md`](../CONTEXTO_RETO.md) |
| Stack, contratos, riesgos | [`references/tech-stack.md`](references/tech-stack.md) |
| Qué significa el número | [`references/model-card.md`](references/model-card.md) |
| Spec viva del score | [`specs/rules-spec.md`](specs/rules-spec.md) |
| Seam `features(company, month)` | [`specs/features-seam.md`](specs/features-seam.md) |
| Front demo / rutas | [`specs/frontend-v0.md`](specs/frontend-v0.md) |
| Clonar, regenerar, tests | [`runbooks/reproduccion.md`](runbooks/reproduccion.md) |
| Calibración Eve | [`runbooks/calibration.md`](runbooks/calibration.md) |
| LLM / proveedores | [`runbooks/ai-runtime.md`](runbooks/ai-runtime.md) |
| Sin tecnicismos | [`MODEL_toni.md`](references/score-explained.md) |
| Runtime cableado | [`audits/2026-09-20-auditoria-plataforma.md`](audits/2026/09-20/auditoria-plataforma.md) |
| Inventario de campos | [`audits/2026-09-20-auditoria-flujo-datos.md`](audits/2026/09-20/auditoria-flujo-datos.md) |
| Defectos del health score | [`audits/2026-09-20-auditoria-health-score.md`](audits/2026/09-20/auditoria-health-score.md) |
| Decisiones de producto | [`plans/2026-09-18-xray-hackathon.md`](plans/2026/09-18/xray-hackathon.md) |
| Tablero HTML de evals | [`../results/dashboard_resultados.html`](results/2026/09-19/dashboard_resultados.html) · [`../results/README.md`](results/README.md) |
| Dataset / packs | [`../../data/README.md`](../data/README.md) |
| Motor Python | [`../../xray/README.md`](../xray/README.md) |
| Ingest FastAPI | [`../../api/README.md`](../api/README.md) |
| Web / Eve | [`../../web/README.md`](../web/README.md) |
| Tests Python | [`../../tests/README.md`](../tests/README.md) |
| Tests web | [`../../web/tests/README.md`](../web/tests/README.md) |
| Evals Eve | [`../../web/evals/README.md`](../web/evals/README.md) |

Raíz del repo: `AGENTS.md`, `README.md`, `CONTEXTO_RETO.md` (instrucciones, no AFS). READMEs in-folder en cada paquete; no duplican este mapa.

## Propietarios AFS

- [Referencias](../REFERENCES.md), [fuentes](../SOURCES.md) y [límites](../GAPS.md).
- Investigación continua: [unidades y evidencia](research/README.md).
- Memoria de trabajo: `logs/YYYY/MM-DD/`, `lessons/<domain>/YYYY/MM-DD/`, `fixes/YYYY/MM-DD/`, `audits/YYYY/MM-DD/`, `plans/YYYY/MM-DD/` y `results/YYYY/MM-DD/`. Logs de dos líneas como máximo; evidencia extensa en su propietario.
- `specs/`, `runbooks/`, `cookbooks/`, `decisions/` y `facts/<domain>/` son documentación viva. `knowledge/` queda reservado a síntesis única generalizable; no contiene el mapa ni las operaciones del producto.
- El intake original está en Drive; las ideas preservadas no son decisiones aceptadas. `data/raw/` es la ruta del dataset operativo y conserva su contrato.
