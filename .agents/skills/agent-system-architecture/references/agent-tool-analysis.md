# Agent Tool Analysis

Systematic analysis of agent tool definitions, registry/composition, schemas, envelopes, and agent wiring.

Use when: auditing tools, adding or changing tools, debugging tool-call failures, or aligning tool sets with agent profiles.

Companion references: `agent-analysis.md` (agent-level), `architecture-analysis.md` (structural), `tool-description-auditor.md` in `prompt-engineering`.

## Primary surfaces

- **Registry & composition**: `registry.py`, `composer.py`, `tool_profiles.yaml`, `discovery.py`
- **Contracts**: `contracts.py` — canonical payloads for adapters
- **Implementations**: `crud/`, `analytics/`, `domain/`, `operations/`, `visualization/`, `service/`, `integrations/`, `pipeline/`
- **Metadata**: `metadata/`, `schemas/`, `decorators.py`
- **Agent wiring**: where tool lists are built and passed to the runner

## Discovery commands

```bash
rg "@function_tool|function_tool" services/tools --type py
rg "^[A-Z_]+_TOOLS\s*=" services/tools --type py
rg "services\.tools" services/agents services/ai --type py
```

## Registry and composition checklist

- [ ] Tool appears in the correct `*_TOOLS` exported set
- [ ] No silent import failure (watch `try/except` blocks that zero out lists)
- [ ] No duplicate tool names in a composed list unless intentional
- [ ] `tool_profiles.yaml` entries match actual agent usage — no orphaned entries
- [ ] Discovery stays consistent with registry; no deprecated tools exposed

Issues to watch: swallowed import errors → empty tool sets at runtime; same capability under multiple names.

## Implementation quality checklist

- [ ] Single responsibility — one tool does one job
- [ ] Uses `RunContextWrapper`/`AppContext` correctly; fails clearly when context is missing
- [ ] Mutations documented; safe retries noted
- [ ] No N+1 queries or unbounded `max_items`
- [ ] Deprecated shims marked and not duplicated in profiles

## Descriptions and schemas checklist

- [ ] Intern test passes (see `tool-description-auditor.md`)
- [ ] XML sections complete: name, summary, intent, behavior, when_to_use/not, parameters, returns, errors, side-effects
- [ ] Three-tier parameter hierarchy followed
- [ ] Verb-last naming consistent with peers
- [ ] Pydantic/schema types match runtime validation and OpenAI/MCP exposure

## Response envelopes checklist

- [ ] Pattern A returned: `status` + `data` + optional `meta`, `insights`, `errors`
- [ ] Partial batch returns `status: "partial"` with per-item errors
- [ ] MCP: `build_tool_response` receives dicts with expected keys; no non-JSON-serializable leakage
- [ ] Streaming: agent layer extracts `data` consistently; tool category matches handler

Issues: raw exceptions or ORM objects in `data`; success with empty `data` and no `insights`.

## Security and side effects checklist

- [ ] All user-controlled strings/IDs validated
- [ ] No tokens or PII in `meta`/`insights` intended for model display
- [ ] Side effects documented in `<side_effects>`; confirmation tools aligned
- [ ] External integrations respect rate limits; surface recoverable errors

## Testing checklist

- [ ] Tool logic tested with real DB; boundaries mocked (no ORM mocking in integration tests)
- [ ] Golden prompts or evals updated when `when_to_use` or naming changes
- [ ] Logger used for ops; `log_error`/`log_warning` for investigation-worthy failures with `tool` in `extra_data`

## Priority matrix

| Severity | Examples |
|---|---|
| Critical | Auth bypass, broken registry import silencing categories, destructive calls without confirmation |
| High | Wrong envelope breaking streaming/MCP, missing permission checks, unbounded queries |
| Medium | Description/schema drift, duplicate tools, partial error handling |
| Low | Naming consistency, doc-only gaps |

## When to re-run

Adding/removing tools, changing `tool_profiles.yaml`, touching `registry.py`/`composer.py`, seeing tool-selection regressions, before MCP exposure changes.
