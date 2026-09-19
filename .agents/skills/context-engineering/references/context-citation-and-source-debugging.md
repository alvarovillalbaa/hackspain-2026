# Context Citation & Source Debugging

How to structure source citations in RAG outputs, parse retrieved context for debugging, and trace which source produced which claim.

**Use when:** implementing citation-native RAG output, debugging "the model cited the wrong source," or auditing grounding quality.

**Do not use for:** RAG retrieval architecture (see `rag-and-vector-stores.md`) or context assembly flow (see `context-engineering.md`).

**Related child skills:** `context-engineering`, `ai-evals-observability`

**Required evals:** `citation_accuracy`, `source_attribution_coverage`, `context_data_parse`

---

## 1. Citation-Native RAG

In citation-native RAG, every factual claim in the model output is linked to a source from the retrieved context. Citations are not added after generation — they are part of the output contract.

**Output contract:**

```json
{
  "response": "The onboarding process takes 3 business days [1] and requires manager approval [2].",
  "citations": [
    { "id": 1, "source_id": "doc_abc123", "chunk_id": "chunk_7", "text": "Onboarding duration is 3 business days." },
    { "id": 2, "source_id": "doc_def456", "chunk_id": "chunk_2", "text": "Manager approval is required for all new hires." }
  ]
}
```

**Enforce at the output format block level.** If the agent is expected to cite sources, add a citation format instruction to the Output Format block in the system prompt.

---

## 2. Context Data Structure

Retrieved context arrives as `context_data`. Parse this structure for debugging:

```python
context_data = {
    "sources": [
        {
            "source_id": "doc_abc123",
            "title": "Onboarding Guide v3",
            "url": "...",
            "chunks": [
                {
                    "chunk_id": "chunk_7",
                    "text": "Onboarding duration is 3 business days.",
                    "score": 0.92,
                    "metadata": { "section": "Timeline", "page": 4 }
                }
            ]
        }
    ],
    "query": "How long does onboarding take?",
    "retrieval_metadata": {
        "tagger": "hr_documents",
        "top_k": 5,
        "reranked": true,
        "elapsed_ms": 210
    }
}
```

**Debug entry point:** always log `context_data.sources` and `context_data.retrieval_metadata` before passing context to the model. Most grounding failures are visible here before the model call.

---

## 3. External Resource IDs in Context

When context includes resources fetched via MCP (external APIs, live data), the source is identified by a resource ID, not a document chunk.

```json
{
  "source_id": "mcp://linear/issue/ENG-1234",
  "resource_type": "linear_issue",
  "fetched_at": "2025-06-01T10:00:00Z",
  "text": "Issue ENG-1234: Add HITL approval flow — Status: In Progress"
}
```

**Freshness caveat:** external resource IDs have a fetch timestamp. If the resource has changed since fetch, the citation may be stale. Add `fetched_at` to citations when the source is live data.

---

## 4. Source Debugging Playbook

**Symptom: model cites a source that wasn't in context**
1. Log `context_data.sources` — is the cited source absent?
2. If absent: model is hallucinating a citation. Add `citation_accuracy` eval case for this failure.
3. If present: model is misidentifying the chunk. Check chunk boundaries and overlap.

**Symptom: model ignores the most relevant source**
1. Check `chunk.score` for the expected source — was it retrieved?
2. If score low: retrieval miss. Adjust tagger query, top_k, or chunking strategy.
3. If score high but model ignored it: context position issue. High-relevance chunks should appear early in the context window.

**Symptom: model attributes a claim to the wrong source**
1. Check if two chunks contain similar but non-identical text.
2. If yes: ambiguous retrieval. Increase chunk granularity or add metadata disambiguation.
3. Check citation IDs in the output — are they offset by one? (Off-by-one ID bugs are common in citation-native output parsers.)

**Symptom: context_data.sources is empty but retrieval was expected**
1. Check `retrieval_metadata.tagger` — was the right tagger selected?
2. Check `retrieval_metadata.elapsed_ms` — did retrieval time out?
3. Check index freshness — was the expected document indexed?

---

## 5. Citation Eval Case Pattern

```python
EvalItemContract(
    slug="citation_accuracy_hr_onboarding",
    description="Model cites correct source chunk for onboarding duration claim",
    input=EvalInput(
        messages=[{"role": "user", "content": "How long does onboarding take?"}],
        context_data={"sources": [hr_onboarding_source_fixture]}
    ),
    evaluators=[
        EvalSubEvaluatorContract(
            type="python",
            function=lambda output: (
                any(c["source_id"] == "doc_abc123" for c in output.get("citations", []))
            ),
            label="citation_source_correct"
        )
    ],
    thresholds={"citation_source_correct": ThresholdConfig(hard_fail=1.0)}
)
```

---

## 6. Graph + Vector Hybrid Retrieval

When context combines vector search (semantic) and graph traversal (structural), citations must identify which retrieval path produced each source.

```json
{
  "source_id": "kg://company/team/engineering",
  "retrieval_path": "graph_traversal",
  "vector_score": null,
  "graph_hops": 2,
  "text": "Engineering team has 12 members as of Q2 2025."
}
```

Tag each citation with `retrieval_path: "vector" | "graph" | "hybrid"` to enable retrieval-path-specific debugging and evals.

---

## Source Notion Pages

- Context Engineering (RAG/context diagrams and architecture)
- Change Format of Citations (citation-native RAG notes, source/result handling)
- Software — RAG source debugging note (parsing `context_data`, source arrays, debugging)
- MCP, Context Engineering, Agents (external resource IDs referenced in context)
- Knowledge Graphs at Scale (Neo4j vector indexes, predictable graph traversals)
