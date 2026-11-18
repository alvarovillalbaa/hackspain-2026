# Watcher agent (Eve)

Monitor autónomo del **Financial Health Score** para el asesor de Embat. Bonus del enunciado: *monitor con alertas autónomas*.

## Forma

| Pieza | Ruta | Rol |
|---|---|---|
| Subagente | `agent/subagents/watcher/` | On-demand vía Mode C (no segundo agente en `withEve`) |
| Gate | `agent/lib/watch-rules.ts` | El LLM **nunca** decide el deterioro; solo redacta |
| Canales | `slack.ts` + `resend.ts` | Slack first-class; email vía Chat SDK + Resend |
| Schedule | `schedules/portfolio-watch.ts` | Barrido laborable 07:00 UTC |
| Fan-out | `channels/watch-dispatch.ts` | `POST /internal/watch` para `submit_alerts` |

## Reglas

| `rule_id` | Condición |
|---|---|
| `outlook_negative_worsening` | `outlook === "negative"` **y** `trend === "worsening"` |
| `watch_event` | `watch != null` |
| `dscr_floor` | `dscr_6m < 1.2` (crítico) |

Sin interpolar `projection_6m`. Barrido: máx. **8** empresas. Dedupe `(company_id, rule_id, month)` en `alert-log.ts`.

## Triggers

1. **On-demand** — `/chat`: «vigila COMP_xxxx» → Mode C → `watcher` → `evaluate_watch` → `submit_alerts`.
2. **Cron** — `portfolio-watch`. En `eve dev` forzar:

```bash
curl -X POST http://localhost:2000/eve/v1/dev/schedules/portfolio-watch
```

Fan-out: `Authorization: Bearer $WATCH_DISPATCH_SECRET` → `/internal/watch`.
Ajustes guarda un Incoming Webhook; al conectar (y al abrir X Ray) se mandan las alertas solas. Dedupe `(company_id, rule_id, month)`.

## Env

```bash
# Incoming Webhook (Ajustes, o env). Preferido frente al bot OAuth.
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

SLACK_BOT_TOKEN= SLACK_SIGNING_SECRET= SLACK_ALERT_CHANNEL_ID=
RESEND_API_KEY= ALERT_EMAIL_FROM= ALERT_EMAIL_TO=
WATCH_DISPATCH_SECRET=
# opcional si eve no está en :2000
WATCH_DISPATCH_URL=http://127.0.0.1:2000/internal/watch
```

Canal sin env → se omite; el otro sigue. Sin hits → el schedule no envía.
Con webhook en Ajustes, las alertas van solas a Slack (`flushWatchToSlack`); no hay cola en el portfolio.

## Test

```bash
cd web && npx vitest run agent/lib/watch-rules.test.ts
```

No tocar `lib/xray/store.ts`, import CSV, evals, ni `withEve` multi-agent.
