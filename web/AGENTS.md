<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# eve agent

Human map of this folder: [`README.md`](README.md). This Next.js app also hosts an eve agent. `withEve()` in `next.config.ts` mounts the agent in `agent/` at `/eve/v1/*`, so `npm run dev` runs both, and one Vercel deploy ships both. There is no separate agent package: eve, the agent and the web app share this `package.json` and `node_modules`.

- `agent/` — the agent (instructions, `agent.ts`, tools, channels, subagents, …). Import its files with `#…` (for example `#lib/foo.ts`).
- `agent/subagents/financing_finale/` — marketplace orchestrator; nested `quantity` → `offering` → `match`.
- `agent/subagents/actions_recommender/` — ficha action Spanish copy.
- `agent/subagents/watcher/` — portfolio alerts.
- `lib/ai/` — Eve binds one model (Helmcode if `OPENAI_API_KEY`, else Gateway) with **no** provider failover. Simple AI SDK calls (`generateStructured` / `generatePlain`) try Gateway then Helmcode. Hooks: `hooks/ai/use-ai-object.ts`.
- `app/chat/`, `app/s/`, `app/_components/` — the web chat that talks to the agent through `useEveAgent` from `eve/react`.
- `app/page.tsx`, `app/companies/`, `app/acciones/`, `app/c/` — demo X Ray (dashboard → empresas → ficha → marketplace). Docs: `docs/specs/frontend-v0.md`. Runtime: `docs/audits/2026-09-20-auditoria-plataforma.md`. LLM ops: `docs/runbooks/ai-runtime.md`.

For a content-only change to the agent's identity, purpose, tone, or response guidelines, edit `agent/instructions.md`. Preserve the model resolver in `lib/ai/provider.ts` / `agent/lib/model.ts` unless asked to change it.

The retrieval tools in `agent/tools/` and the marketplace subagents read the committed fact pack in `lib/xray/dataset/` (`companies.json`, `facts.json`, `scores.json`) through `agent/lib/data.ts` and `agent/lib/facts.ts`. Acciones de la ficha: `GET /api/xray/actions` llama a `actions_recommender` (mismos hechos que `get_recommended_actions`); el LLM no elige importes. Regenerate with `npm run build:facts` (cash/debt/invoices) and `uv run xray-export-web` (Health Scorer).

Mutable demo state persists to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (memory Maps otherwise): `xray/session.json` (focus group for rehearsal, default `GROUP_0147`; does not filter `/` or `/companies`), `xray/imports/`, `xray/import-csvs/` (canonical tables so deal approve can re-call Python `/ingest`), `xray/recommendations/`, `xray/actions/`, `xray/deals/`, `xray/alerts/`. Hidden operator UI: `/start` (noindex, not in nav). Pins that group (reset deals/actions) and opens `/g/{id}`. A “Demo” chip marks it on the groups table and group ficha.

## X Ray demo seam

All demo data goes through `lib/xray/provider.ts` (`export const provider = eveProvider`). Screens and `components/xray/**` must **never** import `lib/xray/registry/` — only the provider does. No mock portfolio: companies/scores/facts come from `lib/xray/dataset/` (built from `data/raw`). Ficha JSON is `ScoreSnapshot` (`lib/xray/schemas.ts`) via `snapshotFromExported`; the Health Scorer export has no `band`.

AI failures must surface as `ErrorState` (page or card). Empty successful loads use `EmptyState`. Never return 200 with invented / echoed AI copy when the provider key is missing — see `docs/runbooks/ai-runtime.md`.

Tests live under `tests/` (vitest unit/integration/smoke + Playwright `tests/e2e/`), never next to source. `npm test` · `npm run test:coverage` · `npm run test:e2e`. Packs CSV: `../data/packs/`.

## Read the eve docs before writing agent code

Start with `node_modules/eve/docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. For the Next.js integration read `node_modules/eve/docs/guides/frontend/nextjs.mdx`. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
npx eve registry search <query> --json
npx eve registry view <item>
npx eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. Never pass a secret in `--answer`.

## Use eve for Vercel operations

```sh
npx eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
npx eve deploy --non-interactive --yes [--project <name-or-id>]
```

## Marketplace directo y ensayo local

`POST /api/xray/recommend` usa `agent/lib/marketplace.ts`: un agente AI SDK con el resolver `flash`, contexto precargado, `evaluate_offers` por lote y `submit_recommendation`. No pasa por raíz → `financing_finale` → especialistas; estos siguen disponibles para Eve/chat. No hay fallback determinista. Cálculos en las herramientas; copy/selección del agente (`source: agent`, `origin: llm`).

Las decisiones se guardan antes de responder en `data/runtime/recommendations/` (o `XRAY_RUNTIME_DIR`), incluso con Blob configurado en local. En Vercel sigue Blob. La clave incluye importe y huella de datos, acción, catálogo y `MARKETPLACE_AGENT_VERSION`; actualizar esta versión al cambiar el contrato/prompts del agente. `persisted: false` indica que el resultado no sobrevivirá al proceso.

Con la web arrancada, `npm run demo:marketplace` prepara todas las acciones financiables del grupo de `/start`; `npm run demo:marketplace -- COMP_0793` limita a empresas concretas. Repetir no llama al modelo si los inputs no cambiaron. No confundir con `warm:recommendations` (baseline determinista antiguo).

Verificación real opt-in (genera y guarda una recomendación en disco): `XRAY_LIVE_MARKETPLACE=1 npm test -- tests/integration/api/recommend-live.test.ts --environment node`. Requiere credencial LLM solo si no hay caché; después prueba la lectura del disco sin proveedor. La suite normal omite esta prueba.
