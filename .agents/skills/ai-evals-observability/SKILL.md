---
name: ai-evals-observability
description: Design and operate production evidence collection for AI systems — traces, telemetry, cost, drift signals, dashboards, and alerts. Feeds evidence to `ai-evals`, not the gate itself.
---

# AI Evals Observability

Own production evidence and operational signals. Do not reconstruct or override authoritative eval decisions.

## Observe deployed behavior

1. Define the operational question, target, environment, sampling policy, retention, privacy boundary, and response owner.
2. Instrument provider-neutral traces for model calls, retrieval, tools, handoffs, errors, retries, latency, usage, and cost. Preserve target, prompt, tool, and configuration versions.
3. Normalize evidence without erasing source provenance. Correlate traces and score observations with stable request, session, scenario, and eval row IDs where available.
4. Build monitors and dashboards for operational health, drift, score distributions, failure clusters, cost, and latency. Distinguish missing coverage from measured zero.
5. Alert on declared thresholds and route incidents to the owning engineering lane. Keep diagnostic signals separate from release-authoritative gates.
6. Export selected, redacted evidence to `ai-evals` for dataset curation, failure attribution, calibration, and regression evaluation.

## Preserve the boundary

| Need | Owner |
| --- | --- |
| Production traces, telemetry pipelines, score monitoring, drift dashboards, alerts, debugging | `ai-evals-observability` |
| Eval objectives, scenario datasets, graders, calibration, statistics, candidate comparison, official gates, release decisions | [`ai-evals`](../ai-evals/SKILL.md) |

Let persisted official gates flow into monitoring as immutable decisions. Never recompute an unofficial average downstream. Route any proposed grader, dataset, or threshold change through `ai-evals` and its calibration policy.

Preserve privacy, data minimization, access control, and approval requirements for new production collection or externally visible monitors. Never request or store hidden model chain-of-thought; retain concise rationales and structured diagnostics only.

Use bundled references, scripts, templates, and examples for implementation details. Consult [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for cross-plugin routing.

Use `scripts/rag_evaluator.py` for deterministic retrieval-quality measurements. This lane owns that implementation; `architecture` may design retrieval systems but must not maintain a second evaluator.
