# Agent Debug Playbooks

Step-by-step diagnostic procedures for the most common agent failure modes. Each playbook starts from observable symptoms and leads to a concrete fix.

---

## Playbook 1: Wrong Tool Selection

**Symptom:** Agent calls tool B when it should call tool A, or calls no tool when one is needed.

### Step 1 — Reproduce with logging

Enable full trace logging for the failing request. Capture:
- The full system prompt (including injected memory blocks)
- The exact user input
- The tool list presented to the model
- The model's tool call (or lack thereof)

### Step 2 — Check tool description ambiguity

Read both the wrong tool's description and the correct tool's description cold (Intern Test). Ask:
- Does the wrong tool's "Use when" clause plausibly match the user intent?
- Does the correct tool's "Use when" clause clearly exclude the wrong interpretation?

**Fix:** Add a "Do NOT use for: X — use {correct_tool} instead" clause to the wrong tool's description.

### Step 3 — Check tool ordering

In the OpenAI Agents SDK, tools listed earlier receive more attention in long contexts. If the correct tool is listed late and the wrong tool is listed early:

**Fix:** Move the correct tool earlier in the tool list for this agent.

### Step 4 — Check for naming confusion

Tool names that share a root word (e.g., `get_candidate` vs `search_candidates`) cause selection errors when the model pattern-matches on name alone.

**Fix:** Rename to maximize semantic distance. Prefer verb-object pairs that are unambiguous: `read_object` vs `search_objects` vs `list_objects`.

### Step 5 — Check tool count

Agents with >15 tools have measurably worse tool selection. If the agent's tool list is large:

**Fix:** Split into sub-agents with domain-specific tool subsets. Route via handoff or manager pattern.

### Step 6 — Add a few-shot example

In the system prompt (not in the tool description), add an explicit example:

```
When the user asks "find the candidate named Alice", call search_objects with
object_type="candidate" and query="Alice". Do NOT call read_object — you don't
have the ID yet.
```

### Step 7 — Add an eval case

```jsonl
{"input": "{the failing user input}", "golden_output": "{expected tool call}", "context": "{relevant context}"}
```

Register under `messages/instructions/evals/tool-selection.jsonl`.

---

## Playbook 2: Hallucination Despite RAG

**Symptom:** Agent returns a factual claim that is not in the retrieved context, or contradicts it.

### Step 1 — Confirm it is actually a RAG failure

Check: was the relevant document retrieved at all?

```python
# Log retrieved documents for the failing query
results = retriever.search(query=user_query, top_k=10)
for r in results:
    print(r.score, r.content[:200])
```

**If the document was NOT retrieved** → this is a retrieval problem (go to Step 2).
**If the document WAS retrieved** → this is a generation problem (go to Step 5).

### Step 2 — Fix retrieval: check similarity floor

The relevant document may exist but scored below the similarity floor:

```python
# Lower floor temporarily to inspect
results = retriever.search(query, similarity_floor=0.5)  # default might be 0.75
```

**Fix options:**
- Lower similarity floor (more recall, more noise — acceptable if re-ranker is applied)
- Improve the document's embedding (check chunking strategy)
- Add the document to a higher-priority retrieval bucket

### Step 3 — Check query formulation

The user's query may be phrased in a way that produces poor embedding similarity with the document.

**Fix:** Apply Step-Back prompting — abstract the query before retrieval:
```
User: "What's the parental leave in Germany?"
Abstract: "What are our European HR compliance policies?"
```

### Step 4 — Check chunking granularity

Documents chunked too coarsely dilute the relevant signal. Documents chunked too finely lose cross-sentence context.

**Fix:** Adjust chunk size (typical: 512–1024 tokens for factual docs; 256 for structured data). Add overlap (128 tokens) to preserve cross-chunk context.

### Step 5 — Fix generation: grounding instruction not strong enough

The system prompt must contain an explicit grounding guardrail:

```
ALWAYS ground every factual claim in the provided context.
If the context does not contain the answer, say "I don't have that information."
Do NOT infer, extrapolate, or paraphrase facts not present in context.
```

Weak: "Use the context to answer."
Strong: "If the claim is not in the context, say so. Never synthesize."

### Step 6 — Check context position

In long contexts, relevant content injected late (after many tokens) receives less attention.

**Fix:** Move the most relevant retrieved block to the top of the context, before less relevant blocks.

### Step 7 — Add a groundedness eval

Register a groundedness evaluator with `hard_fail` for any fabricated claim:

```python
EvalThreshold(name="primary", value=85.0, hard_fail_below=50.0, failure_policy="hard_fail")
```

**Eval type:** `label_model` with labels `("pass", "fail", "hard_fail")`.

---

## Playbook 3: Latency Spike / First-Token Regression

**Symptom:** Agent response time increased significantly. Time-to-first-token (TTFT) or total latency regressed.

### Step 1 — Identify which latency component spiked

Decompose the latency budget:

| Component | Typical range | Measurement |
|-----------|--------------|-------------|
| Context assembly | 50–200ms | Trace start → SDK call |
| TTFT (model) | 500ms–3s | SDK call → first streaming token |
| Token generation | 10–50ms/token | First token → last token |
| Tool execution | Varies | Tool call → tool result |
| Post-processing | 10–100ms | Last token → result persisted |

Check: which component grew?

### Step 2 — Context assembly spike

**Cause:** Too many tool outputs accumulated in `run_memory`; context compaction triggering unnecessarily.

**Fix:**
- Audit persistence policies — are ephemeral tools marked correctly?
- Check `SESSION_COMPACT_LIMIT` — is compaction triggering prematurely?
- Profile `AgentMessageContextProjector` — which block is largest?

### Step 3 — TTFT spike (model-side)

**Cause:** Input token count grew (prompt bloat). Common after adding new SPL blocks or memory injections.

**Fix:**
- Measure token count before and after the regression
- Identify which context block grew
- Apply compaction to that block or trim it

### Step 4 — Token generation spike (reasoning model)

**Cause:** Reasoning budget increased due to more complex task or ambiguous instructions.

**Fix:**
- Check if instructions became more ambiguous recently (SPL update, prompt change)
- Simplify or clarify the instruction that caused reasoning bloat
- If using extended thinking, set an explicit token budget cap

### Step 5 — Tool execution spike

**Cause:** External tool (DB query, API call, MCP server) became slower.

**Fix:**
- Check the tool's execution trace independently of the agent
- Add timeout + graceful degradation to the slow tool
- Cache tool results for tools with session-scoped persistence

### Step 6 — Streaming transformation spike

**Cause:** Large tool outputs being streamed through a transformation layer.

**Fix:**
- Apply `stream_policy = "none"` to high-volume tools that don't need real-time streaming
- Paginate or summarize large tool outputs before streaming

### Step 7 — Add a latency eval

```python
EvalSubEvaluatorContract(
    name="ttft-budget",
    implementation_type="python",
    # custom grader: pass if TTFT < threshold_ms
)
```

---

## Agent Change Checklist

Use this checklist before merging any change to agent instructions, tool definitions, or model configuration.

### Pre-change
- [ ] Run `slugs_for_changed_paths([changed_files])` to identify affected eval slugs
- [ ] Record baseline eval scores for affected slugs
- [ ] Baseline eval result documented (score, date, eval mode)

### The change
- [ ] Instruction change: Intern Test applied to any modified tool descriptions
- [ ] SPL update: safety scanner passed, risk level documented
- [ ] New tool: tool audit checklist completed (see [tool-call-design.md](../../prompt-engineering/references/tool-call-design.md#10-tool-audit-checklist))
- [ ] Memory change: persistence policy reviewed for affected tools
- [ ] Model change: provider-specific parameter compatibility verified

### Post-change eval gate
- [ ] Run affected eval slugs in `mode="standard"`
- [ ] Score delta vs baseline documented
- [ ] All `hard_fail` gates passed
- [ ] `soft_fail` warnings reviewed and accepted or addressed
- [ ] If score regressed > 5 pts: root-cause identified, fix applied or risk accepted

### Required artifacts
- [ ] Changelog entry: what changed, why, affected agents
- [ ] Eval run note: baseline → new score, eval slug, date
- [ ] Rollback plan: what to revert if production issues observed

### Ship criteria (definition of done)
- [ ] Eval gate passes in CI
- [ ] At least one production smoke test completed
- [ ] Alert/monitoring in place for the capability being changed
- [ ] On-call aware of the change (for high-risk changes)
