# `web/` — cockpit del asesor

Last updated: 2026-09-20

Next.js 16 + React 19 + Eve. Una sola app: el front del asesor y el agente (`withEve()` monta `/eve/v1/*`). Vercel: *Root Directory* = `web`.

Antes de tocar código del agente o del seam, lee [`AGENTS.md`](AGENTS.md). Este README es el mapa humano.

## Cuándo estás aquí

- Pantallas del asesor, chrome Embat, rutas `app/`
- Rutas `app/api/xray/*` (Next; no confundir con FastAPI)
- Agente Eve, marketplace, watcher
- Fact pack y store (Blob / `data/runtime/`)

No recalcules el Health Score en TypeScript. No importes `lib/xray/registry/` desde `components/`.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Node 24. Claves: [`../docs/runbooks/ai-runtime.md`](../docs/runbooks/ai-runtime.md). Ingest CSV: `XRAY_API_URL` → [`../api/README.md`](../api/README.md).

## Mapa interno

| Ruta | Qué |
|---|---|
| [`lib/xray/`](lib/xray/README.md) | Seam TS: snapshot, match, scoring, store |
| [`agent/`](agent/README.md) | Eve: instructions, tools, subagentes |
| `app/` | Rutas (dashboard, fichas, marketplace, `/start`) |
| `components/embat/` · `components/xray/` | Chrome y widgets |
| [`tests/`](tests/README.md) | vitest + Playwright — no junto al código |
| [`evals/`](evals/README.md) | Calibración Eve / never-calculate |
| `lib/xray/dataset/` | Fact pack en git (`scores.json`, `facts.json`, …) |
| [`data/runtime/`](data/runtime/README.md) | Sesión / deals / imports locales |

Pantallas: [`../docs/specs/frontend-v0.md`](../docs/specs/frontend-v0.md).

```bash
npm run typecheck && npm test && npm run test:coverage
npm run test:e2e
npm run calibrate
```
