---
name: context-engineering
description: Design and debug context assembly, memory tiers, retrieval, RAG, vector stores, compaction, grounding, and citation contracts for AI systems.
---

# Context Engineering

## Use When

- Designing what context an agent or model receives, in what order, and under which token budget.
- Choosing memory scopes, retention rules, compaction behavior, or retrieval boundaries.
- Building or debugging RAG, vector search, grounding, citations, and source attribution.
- Investigating missing context, stale memory, irrelevant retrieval, recitation risk, or prompt-context collisions.

## Workflow

1. Identify the decision or output the context must support and the failure mode being addressed.
2. Inventory authoritative sources, memory tiers, retrieval paths, tool outputs, and prompt layers.
3. Define precedence, freshness, provenance, privacy, and token-budget rules before choosing implementation details.
4. Separate durable memory from session state, retrieved evidence, and generated summaries.
5. Test retrieval quality and context assembly with representative queries, adversarial omissions, stale sources, and conflicting evidence.
6. Require citations or source handles where outputs must be auditable.
7. Measure answer quality, retrieval relevance, latency, and cost; document what remains unevaluated.

## References

- `references/context-engineering.md` - context assembly, prioritization, and token-budget design.
- `references/memory-and-system.md` - memory tiers and system boundaries.
- `references/memory-scope-and-recitation.md` - scope, retention, privacy, and recitation risk.
- `references/rag-and-vector-stores.md` - retrieval and vector-store patterns.
- `references/context-citation-and-source-debugging.md` - grounding, provenance, and citation debugging.

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `quality-assurance/ai-evals`
- `quality-assurance/security`
- `backend`
- `cloud`
- `plugins-management`
- `brain`

## External Skill Chains

Use live external skills when installed, while preserving local rules and repository facts.

- `clous-knowledge-retrieval`: Use Clous-owned retrieval guidance for source-grounded context. Install: `python3 scripts/install-external-skills.py --skill clous-knowledge-retrieval --agent codex`.
- `use-afs`: Apply AFS filesystem layout and naming conventions. Install: `python3 scripts/install-external-skills.py --skill use-afs --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
