# Context Engineering

Context engineering is input-control for language models. Selecting, ordering, compressing, and verifying the right state shapes model behavior more than reasoning chain length or model size alone.

---

## 1. Core Principle

Context quality is an **input-control problem**, not a prompt-length problem. The relevant questions are:
- Is the right state present?
- Is irrelevant state absent?
- Is the ordering and structure optimal for attention?
- Are constraints explicitly tracked?

Extended reasoning chains can amplify bad context (spurious correlations, red herrings, distractor injection). Fix context before extending reasoning.

---

## 2. Context Types

| Type | Description | Lifetime | Injection point |
|------|-------------|----------|-----------------|
| `working_context` | Goals, stated facts, user constraints | Current turn | Before tool calls |
| `run_memory` | Tool outputs, recitation results, session signals | Session | After system prompt |
| `cross_run_memory` | Long-lived user/company preferences and corrections | Persistent | After system prompt |
| `input_contexts` | External inputs: files, URLs, object attachments | Per-request | After memory blocks |
| `agent_rules` | Durable agent behavior rules (from system prompt) | Static | First in prompt |
| `CLO_documents` | Product markdown docs, policy docs | Versioned | Loaded on demand |
| `compression_summaries` | Prior context compressed by the compaction pipeline | Session | Replaces raw history |

**Ordering rule**: memory blocks before input contexts; input contexts before user message. Structure signals attention budget allocation.

---

## 3. Context Assembly Flow

```
1. Request arrives
   ↓
2. retrieve_service.get_thread_context(thread_id, limit=3)
   → {conversations, canvases, executions}
   ↓
3. ContextAssemblyService.preprocess_inputs(files, links, objects)
   → processes uploads, scrapes URLs, maps objects to structured refs
   ↓
4. Build LLMContext:
   - working_context: facts, goals, memory, artifacts
   - run_memory: errors, recitation, sources, tool outputs
   - cross_run_memory: long-lived key/value memory
   ↓
5. AgentMessageContextProjector orders context blocks:
   [agent_rules] [CLO_docs] [dynamic_memory] [constraints]
   [working_context] [input_contexts] [plans] [compression_summaries]
   ↓
6. AIMessageAssemblyService combines:
   - Rendered agent instructions
   - Context blocks
   - User input + examples + media
   → provider-ready message list
```

---

## 4. Tagger Architecture

Taggers are routing infrastructure: they classify user utterances into context domains before the generation call. This separates intent detection from content generation.

**Tag classes:**
| Tag | Description |
|-----|-------------|
| `clous_context` | HR product context — jobs, candidates, companies |
| `assistant_context` | Agent's own capabilities and scope |
| `job_context` | Job posting specific queries |
| `company_context` | Company-level information queries |
| `feedback` | User correction or preference signal |
| `default` | General interaction, no special context domain |
| `null` | Ambiguous; fall through to base behavior |

**Tagger design choices:**
| Approach | Trade-offs |
|----------|-----------|
| Embedding classifier | Fast, no LLM cost, less nuanced |
| Prompted LLM | Flexible, higher latency, more accurate |
| Regex rules | Deterministic, zero cost, brittle at edge cases |
| Hybrid (rules + LLM) | Best accuracy/cost ratio for most cases |

**Rule**: use the simplest tagger that achieves reliable routing. Add an eval case for each routing failure mode.

---

## 5. Context Budget Design

| Parameter | Description | Tuning guidance |
|-----------|-------------|-----------------|
| `top_k` | Max retrieved documents | Start 5–10; tune via retrieval eval |
| `top_s` | Similarity score floor | 0.7–0.8 typical; lower = more recall, more noise |
| `limit` (thread context) | Max prior conversation turns | 3–5 for most agents; 1 for stateless |
| Context budget (chars) | Max chars before compaction triggers | Set relative to COMPACT_START (100k) |

**Budget allocation rule**: allocate ≤30% of context budget to retrieved/injected content. Reserve ≥40% for the active conversation. Reserve ≥20% for tool call budgets.

---

## 6. Context Failure Modes

| Failure | Symptoms | Fix |
|---------|----------|-----|
| **Distractor injection** | Agent answers the wrong question; conflates unrelated items | Raise similarity floor; apply re-ranking |
| **Constraint drift** | Agent forgets a constraint stated early in context | Move constraint to a pinned position in system prompt |
| **Recency bias** | Agent overweights the most recent message, ignores prior context | Increase context limit; apply compression summaries |
| **Context flooding** | All top_k results returned regardless of relevance | Apply similarity floor + MMR diversification |
| **Stale retrieval** | RAG returns outdated documents | Add freshness filter (date field) to retrieval query |
| **Missing provenance** | Model cites without grounding | Add source attribution requirement to system prompt |

---

## 7. Multi-Query Patterns

### Step-Back Prompting
Generate a more abstract version of the query before retrieval:
```
User: "What is our parental leave policy in Germany?"
Step-back: "What are our European compliance policies?"
→ Retrieve against the abstract query; answer from specific
```

### Parallel Multi-Query
Run N query variants simultaneously; merge results before generation:
```python
queries = [original_query, rephrase_1, rephrase_2]
result_sets = await asyncio.gather(*[retrieve(q) for q in queries])
merged = deduplicate_by_embedding(result_sets)
```

### Sequential Refinement
Use first-pass results to formulate a follow-up retrieval query before generating the answer.

---

## 8. Context Compaction Strategies

Applied when session context exceeds the compaction threshold:

| Strategy | Context size | Description |
|----------|-------------|-------------|
| Simple summary | 100k–120k chars | Single-pass LLM summary of history |
| Parallel summarization | 120k–300k | Chunk → parallel summarize → merge |
| Critique-jury | 300k–600k | Summarize → critique → revise |
| Research synthesis | 600k–1.2M | Multi-source synthesis with attribution |
| Iterative refinement | >1.2M | Rolling window with progressive compression |

**Compaction invariant**: hard constraints (guardrails, user-stated corrections) must survive every compaction pass. Validate this with an eval case.

---

## 9. RAG Context Assembly

```python
# Retrieval with freshness and diversity
results = retriever.search(
    query=user_message,
    object_types=["job", "candidate", "company"],
    top_k=10,
    similarity_floor=0.75,
    freshness_days=90,       # exclude content older than 90 days
    mmr_lambda=0.7,          # balance relevance vs diversity
)

# Reranking
reranked = reranker.rerank(results, query=user_message, top_n=5)

# Context assembly
context_block = format_for_injection(
    results=reranked,
    include_source_citations=True,
    max_chars=20_000,
)
```

---

## 10. Debugging Wrong-Context Failures

When the model uses the wrong context:

1. **Log the full context window** for the failing request (not just the user message)
2. **Check what was retrieved**: did the retriever return the wrong documents?
   - If yes → fix similarity floor, add filters, check embedding quality
3. **Check ordering**: was the relevant context positioned late in a long window?
   - If yes → move critical context earlier; apply position-aware attention budgeting
4. **Check tagger routing**: was the wrong context domain activated?
   - If yes → add tagger training example for this intent
5. **Check compaction**: was the relevant context lost during compression?
   - If yes → add to "pinned content" list that bypasses compaction

**Eval case required**: every confirmed wrong-context failure must generate an eval case before the fix is merged.
