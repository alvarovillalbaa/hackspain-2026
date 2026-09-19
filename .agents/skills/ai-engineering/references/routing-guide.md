# AI Engineering — Routing Guide

Router for AI/LLM engineering work. Routes to specialist child skills.

## Child Skills

| Child | Owns |
|-------|------|
| `context-engineering` | RAG pipelines, vector stores, context engineering |
| `ai-evals` | Evaluation frameworks, test datasets, scoring |
| `ai-evals-observability` | Observability, tracing, latency, cost monitoring |
| `ai-governance-safety` | Safety gates, HITL policies, model risk |
| `prompt-engineering` | Prompt engineering, tool schemas, structured output |
| `agent-system-architecture` | Multi-agent system design |

## Routing Decision Tree

```
Is this about retrieval, vector search, or RAG pipelines?
  → context-engineering

Is this about measuring/testing AI output quality?
  → ai-evals

Is this about monitoring AI systems in production?
  → ai-evals-observability

Is this about safety, compliance, or governance?
  → ai-governance-safety

Is this about writing or optimizing prompts and tool schemas?
  → prompt-engineering

Is this about wiring multiple AI agents together?
  → agent-system-architecture
```

## AI Engineering Standards

- **Eval before ship**: No AI feature goes to production without an eval baseline.
- **Structured outputs**: Use tool_use / structured output for machine-readable responses; plain text for human-facing responses.
- **Context budgets**: Set token budgets per call. Monitor actual vs. budgeted usage.
- **Fallback paths**: Every AI call needs a graceful degradation path.
- **Latency SLAs**: Define P50/P95/P99 latency targets before building.
