# `web/agent/` — Eve

Last updated: 2026-09-20

Agente montado en `/eve/v1/*` por `withEve()` en `next.config.ts`. Comparte `package.json` con la web. Imports internos: `#…` (p. ej. `#lib/facts.ts`).

El LLM **nunca calcula**. Lee el fact pack y tools; quantity/offering/match cotizan; el servidor recomputa match y uplift. Copy de acciones: `actions_recommender`. Alertas: `watcher`.

Identidad y tono: [`instructions.md`](instructions.md). Modelo: `lib/model.ts` (Helmcode si hay `OPENAI_API_KEY`, si no Gateway; Eve **sin** failover).

## Topología

```
agent/
  agent.ts · instructions.md
  tools/                          # Mode A: overview, facts, metrics, …
  subagents/
    financing_finale/             # marketplace
      subagents/{quantity,offering,match}/
    actions_recommender/          # títulos de la ficha
    watcher/                      # cola + Slack
    self-modification/            # sandbox de la plantilla; no es producto
```

HTTP recommend: root → `financing_finale` → hijo de etapa. HTTP actions: root → `actions_recommender`.

Operación: [`../../docs/runbooks/ai-runtime.md`](../../docs/runbooks/ai-runtime.md). Calibración: [`../../docs/runbooks/calibration.md`](../../docs/runbooks/calibration.md). Docs Eve: `node_modules/eve/docs/README.md`.
