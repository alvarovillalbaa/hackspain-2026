# Calibración agéntica

Un **eval** pregunta *¿acertó?*. La **calibración** pregunta *¿acierta siempre igual?* y *¿cita cifras del motor o inventa?*.

No sustituye a `uv run xray-evals` (métricas del score Python) ni a un eval de calidad semántica. Vive junto a ellos en `web/evals/calibration/` y se invoca aparte.

## Dos umbrales del 2 %

| Umbral | Qué mide | Campos |
|---|---|---|
| **Repetibilidad** — CV = σ/\|μ\| ≤ 2 % | Dispersión entre N ejecuciones idénticas | Importes, tipos, match, fees, plazo |
| **Fidelidad** — error relativo ≤ 2 % | Cifra del agente vs motor determinista (`lib/xray/match.ts` / `reassemble`) | `ranking[].match` y amigos; `ideal_amount` vs `solveIdealAmount` |
| **Grounding** ≥ 98 % | Cifras citadas en prosa Mode A existen en el fact pack (±2 %) | Todo número extraído del markdown |

### Caveat de resolución a N = 8

Con 8 repeticiones, la menor discrepancia **observable** en un campo categórico es 1/8 = 12,5 %. Un umbral del 2 % ahí no es medible, así que:

- **Continuos** → CV ≤ 2 % (gate real).
- **Categóricos** (emisor ganador, `action_kind`, secciones, `get_company_overview`) → **unanimidad**.
- **Redacción** → se mide (similitud) y **no** cierra el gate.

`CALIBRATION_REPS` (default 8) y `CALIBRATION_CONCURRENCY` (default 3) permiten un humo barato (`REPS=2`) antes de gastar.

## Por qué no pasa por `/api/xray/recommend`

Esa ruta resuelve memoria → Blob → `recommendations.json` **antes** de llamar al modelo. Ocho POSTs devolverían los bytes de la primera y el gate pasaría midiendo nada. La calibración usa `eve eval` → `t.newSession()` → `sessions.create` directo.

## Cómo se ejecuta

```bash
cd web
# Node ≥ 24 (engines del package.json)
export AI_GATEWAY_API_KEY=…   # o eve link / VERCEL_OIDC_TOKEN
npm run calibrate             # eve eval calibration --strict

# Humo barato (2 reps)
CALIBRATION_REPS=2 npx eve eval calibration/orchestrator/0000
```

Artefactos:

- Eve: `.eve/evals/<timestamp>/`
- Resumen nuestro: `artifacts/calibration/latest.json` (repo root)

## Mitad determinista (Python)

`tests/test_calibration_determinism.py` ejecuta `score_table` dos veces sobre el fixture y exige igualdad exacta. El score no tiene RNG; la única pieza estocástica del producto es Eve.

```bash
uv run pytest tests/test_calibration_determinism.py
```

## Manifiesto

`web/evals/data/calibration-manifest.json` — tres empresas del demo (`COMP_0001`, `COMP_0047`, `COMP_0203`), mismas claves que el warm cache de recomendaciones. `row_id` estable; no reordenar sin bump de `version`.

## Coste

3 casos × 8 reps × 2 modos ≈ 48 sesiones; Mode B abre 3 subagentes por ejecución. Por eso vive bajo el tag `slow` y **no** entra en el `npm run eval` del día a día.

## Relación con la regla «el LLM nunca calcula»

La fidelidad convierte esa regla de `AGENTS.md` en un gate: si `ranking[i].match` se desvía >2 % del `computeMatch` / `reassembleMatches` del servidor, el modelo inventó el número.
