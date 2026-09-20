# Suite de tests — web (Next + Eve)

Last updated: 2026-09-20

Tests **no** viven junto a `lib/` / `components/`.

| Carpeta | Qué |
|---|---|
| `unit/lib/xray` | Motor TS: match, scoring, store, … |
| `unit/lib/ai` | Provider / generate |
| `unit/agent` | Fact pack layer, watch rules |
| `unit/hooks` | Hooks de selección / ofertas |
| `unit/evals` | Helpers de calibración (sin LLM) |
| `integration/api` | Handlers `app/api/xray/*` |
| `smoke` | Fact pack live (JSON committed) |
| `e2e` | Playwright — no en `npm test` |
| `evals` | Wrapper de suites Eve / offline |
| `tmp` | Scratch gitignored |

```bash
npm test
npm run test:coverage
npm run test:e2e
```

Calibración Eve y pipeline Python: [`../../docs/runbooks/reproduccion.md`](../../docs/runbooks/reproduccion.md).
