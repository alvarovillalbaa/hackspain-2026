# `web/lib/xray/` — seam TypeScript

Last updated: 2026-09-20

Lógica de producto que corre en Next (servidor). Las pantallas **no** importan `registry/`: solo `provider.ts`.

No pongas aquí el mapa isotónico (eso es Python). No dejes que el LLM emita un número que no exista en el JSON de entrada.

## Piezas

| Fichero / carpeta | Qué |
|---|---|
| `provider.ts` | Único seam UI → datos (`eveProvider`) |
| `schemas.ts` | `ScoreSnapshot` Zod — **seam** con `xray-export-web` |
| `snapshot.ts` | `snapshotFromExported`: banda, sub-scores, alerts |
| `scoring.ts` | Uplift / radar: **otro** 0–100 sobre dimensiones |
| `match.ts` | Match bilateral cliente × emisor; `solveIdealAmount` |
| `marketplace-orchestrator.ts` | quantity → offering → match; recomputa cifras |
| `store.ts` | Blob → JSON en `web/data/runtime/` → Maps |
| `dataset/` | Fact pack committed |
| `registry/` | Implementación del provider (solo el provider importa) |

Si cambias un campo del snapshot: el mismo commit toca `records_from_scored` (Python), `snapshotFromExported` y Zod.

Tests: `web/tests/unit/lib/xray/`. Runtime: [`../docs/audits/2026-09-20-auditoria-plataforma.md`](../../../docs/audits/2026-09-20-auditoria-plataforma.md).
