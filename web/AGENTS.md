<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# eve agent

This Next.js app also hosts an eve agent. `withEve()` in `next.config.ts` mounts the agent in `agent/` at `/eve/v1/*`, so `npm run dev` runs both, and one Vercel deploy ships both. There is no separate agent package: eve, the agent and the web app share this `package.json` and `node_modules`.

- `agent/` — the agent (instructions, `agent.ts`, tools, channels, subagents, …). Import its files with `#…` (for example `#lib/foo.ts`).
- `app/chat/`, `app/s/`, `app/_components/` — the web chat that talks to the agent through `useEveAgent` from `eve/react`.
- `app/page.tsx`, `app/companies/`, `app/acciones/`, `app/productos/`, `app/c/` — demo X Ray (dashboard → empresas → ficha → marketplace). Docs: `docs/frontend_v0.md`. Runtime: `docs/auditoria_plataforma.md`.

For a content-only change to the agent's identity, purpose, tone, or response guidelines, edit `agent/instructions.md`. Preserve the model in `agent/agent.ts` unless asked to change it.

The retrieval tools in `agent/tools/` and the marketplace subagents read the committed fact pack in `lib/xray/dataset/` (`companies.json`, `facts.json`, `scores.json`) through `agent/lib/data.ts` and `agent/lib/facts.ts`. Acciones de la ficha: `GET /api/xray/actions` llama a `recommendActions` (mismos hechos que `get_recommended_actions`); el LLM no elige importes. Regenerate with `npm run build:facts` (cash/debt/invoices) and `uv run xray-export-web` (Health Scorer).

Mutable demo state persists to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set (memory Maps otherwise): `xray/session.json` (focus group for rehearsal, default `GROUP_0147`; does not filter `/` or `/companies`), `xray/imports/`, `xray/recommendations/`, `xray/actions/`, `xray/deals/`, `xray/alerts/`. Hidden operator UI: `/start` (noindex, not in nav). Pins that group (reset deals/actions) and opens `/g/{id}`. A “Demo” chip marks it on the groups table and group ficha.

## X Ray demo seam

All demo data goes through `lib/xray/provider.ts` (`export const provider = eveProvider`). Screens and `components/xray/**` must **never** import `lib/xray/registry/` — only the provider does. No mock portfolio: companies/scores/facts come from `lib/xray/dataset/` (built from `docs/data/raw`). Ficha JSON is `ScoreSnapshot` (`lib/xray/schemas.ts`) via `snapshotFromExported`; the Health Scorer export has no `band`.

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
