# AI runtime — X Ray

Last updated: 2026-09-20

**Date:** 2026-09-20  
**Scope:** how LLM credentials, simple AI SDK calls, and Eve agents are wired after the fail-closed resolver.

## Credentials

| Use | Env | Backend | Failover |
|---|---|---|---|
| **AI SDK** (`generateStructured` / `generatePlain`) | `AI_GATEWAY_API_KEY` or `VERCEL` (OIDC), then `OPENAI_API_KEY` | Gateway catalog → Helmcode | yes — Gateway dies, Helmcode runs |
| **Eve** (chat, marketplace, watcher, actions) | `OPENAI_API_KEY`, else Gateway to boot | Helmcode `glm5.3` / `deepseek-v4-flash` (or Gateway if no Helm key) | **none** — a failed Eve call stays failed |
| neither key | — | **throws** `MissingLlmKeyError` | no silent mock |

Models: Helmcode ficha `glm5.3` · flash `deepseek-v4-flash`. Gateway ficha `openai/gpt-5.6-luna` · flash `openai/gpt-5.6-luna-fast`.

Code: [`web/lib/ai/provider.ts`](../web/lib/ai/provider.ts). Eve re-exports via [`web/agent/lib/model.ts`](../web/agent/lib/model.ts).

**Vercel:** set `OPENAI_API_KEY` for Eve quality. Keep Gateway (OIDC or `AI_GATEWAY_API_KEY`) so explain/simple calls can fail over to Helmcode. Gateway alone still boots both stacks (Eve then uses Gateway with no retry).

## Two stacks

| Stack | When | Entry |
|---|---|---|
| **AI SDK** (`web/lib/ai/generate.ts`) | Simple structured/plain LLM (e.g. explain tooltips) | Feature routes call `generateStructured` / `generatePlain` |
| **Eve** (`web/agent/`) | Chat, marketplace pipeline, ficha actions copy, watcher | `/eve/v1/*` + `Client.sessions.create` |

There is **no** generic “prompt anything” HTTP endpoint. Client hooks (`useAiObject`) POST to feature routes only.

## Eve topology (one mount)

`withEve(nextConfig)` → single root at `/eve/v1`. Nested specialists:

```
agent/
  tools/                          # Mode A retrieval
  subagents/
    financing_finale/             # marketplace orchestrator
      subagents/{quantity,offering,match}/
    actions_recommender/          # ficha action copy
    watcher/
    self-modification/
```

HTTP recommend stages: root → `financing_finale` → stage child. HTTP actions: root → `actions_recommender`.

## Error vs empty UI

| Situation | UI |
|---|---|
| Score / primary load failed | page `ErrorState` |
| One widget failed (peers, cash, acciones, ofertas, metrics) | card `ErrorState` |
| Eve / LLM **timeout** (abort wall-clock o stage) | card/page `TimeoutState` vía `AiFailureState` — API **504** `{ code: "timeout" }` |
| 200 with nothing to show | card/page `EmptyState` |
| AI route failed (missing key, Eve throw, invented numbers) | **4xx/5xx** — no echo / no engine-as-success |

Primitives: [`web/components/xray/feedback-state.tsx`](../web/components/xray/feedback-state.tsx).

Deterministic marketplace (`deterministicMarketplace`) remains for tests / `npm run warm:recommendations` only — live `POST /api/xray/recommend` returns **504** on timeout and **502** if Eve fails otherwise.

## No cerrado

- Whether the Vercel project currently has `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, or only OIDC — check the dashboard; this repo cannot see secrets.
- Gateway catalog id `openai/gpt-5.6-luna` / `luna-fast` may change; if Gateway returns model-not-found, retarget `GATEWAY_FICHA_MODEL` / `GATEWAY_FLASH_MODEL` in `web/lib/ai/provider.ts` (do **not** silently fall through to invented data).
- Nested Eve hop adds one root model call per marketplace stage; if latency is too high for the demo, consider flattening quantity back under root (breaking the intended folder layout).
- After moving nested subagents, restart `npm run dev` so Eve recompiles the agent tree (hot reload can leave a dead Eve proxy → `ECONNREFUSED` / recommend 502).
- Subagent models resolve lazily via `defineDynamic` (`step.started`) so missing keys fail on the first turn, not at module import.
