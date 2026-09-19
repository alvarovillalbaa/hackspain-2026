# Agent Performance & First-Token Latency

Metrics and debug playbook for agent-perceived performance — with emphasis on time-to-first-user-visible-work, not just time-to-first-token.

**Use when:** diagnosing why an agent feels slow to users, instrumenting a new agent for latency observability, or setting latency SLOs.

**Do not use for:** eval regression architecture (see `evals-system.md`) or HITL event latency (see `hitl-and-approval-preferences.md`).

**Related child skills:** `ai-evals-observability`, `agent-system-architecture`, `ai-governance-safety`

**Required evals:** `time_to_first_status_p95`, `hidden_work_budget`, `progress_heartbeat_gap`

---

## Core Insight

Agents are not slow to stream. They are slow to start user-visible work.

`time_to_first_token_ms` (TTFT) measures when model output begins. But users experience latency as the gap between their request and the first thing they can see or act on. An agent that does 3 seconds of silent context assembly before streaming a single token has an unacceptable user-perceived latency regardless of its TTFT.

---

## 1. Metric Definitions

| Metric | What it measures | SLO target |
|---|---|---|
| `time_to_first_status_ms` | Request → first useful progress event emitted to stream | ≤ 300ms |
| `time_to_first_token_ms` | Request → first model output token | ≤ 1500ms (simple), ≤ 3000ms (complex) |
| `time_to_first_tool_event_ms` | Request → first tool call intent visible in stream | ≤ 2000ms |
| `hidden_work_ms` | Total time elapsed before any user-visible output | ≤ 500ms |
| `context_assembly_ms` | Time to assemble full context before first model call | instrument; alert if > 500ms |
| `status_gap_p95_ms` | 95th-percentile gap between consecutive progress updates | ≤ 2000ms |
| `total_latency_ms` | Request → final response complete | depends on task class |

These metrics extend the existing trace standard (see `ai-observability.md`) with user-perception-focused dimensions.

---

## 2. Debug Playbook

**If `time_to_first_status_ms` > 300ms:**
- Agent is not emitting a status event immediately on invocation.
- Fix: emit `run_started` or `thinking` event as the first stream action, before any context assembly.

**If `hidden_work_ms` > 500ms:**
- Agent is doing context assembly, preference lookup, or planning before streaming anything.
- Fix: emit a `planning` or `context_loading` progress event before blocking work begins.

**If TTFT is acceptable but user-perceived latency is bad:**
1. Check `hidden_work_ms` — likely silent internal agent/model work before streaming.
2. Emit an early status event before planning loop begins.
3. Stream tool-call intent when safe (before tool execution completes).
4. Avoid silent context assembly > 500ms; log and alert if exceeded.
5. Add progress heartbeat for workflows expected to exceed 5 seconds.

**If `status_gap_p95_ms` > 2000ms:**
- User sees the agent "freeze" between steps.
- Fix: add intermediate status events during long tool executions and multi-step planning.

**If `context_assembly_ms` spikes on cache miss:**
- Cache invalidation is regenerating the full context from scratch.
- Fix: partial context assembly using cached base + delta assembly for changed sections.

---

## 3. Emission Protocol

Every agent run must emit progress events in this order:

```
1. run_started          ← emit immediately (< 50ms after invocation)
2. planning             ← emit before context assembly begins
3. context_loading      ← emit when RAG/tagger retrieval starts (if applicable)
4. tool_call_intent     ← emit when a tool call is selected (before execution)
5. tool_executing       ← emit during long tool executions (> 1000ms)
6. <model streaming>    ← token stream begins
7. run_complete         ← emit when all work is done
```

Do not wait for work to complete before emitting the preceding event. Events are pre-work signals, not post-work confirmations.

---

## 4. Progress Heartbeat for Long Workflows

For workflows expected to exceed 5 seconds:

```python
async def run_with_heartbeat(agent_run, heartbeat_interval_ms=2000):
    last_event_time = time.monotonic()
    async for event in agent_run.stream():
        yield event
        last_event_time = time.monotonic()

    # Heartbeat if gap exceeds interval
    while agent_run.is_running():
        if (time.monotonic() - last_event_time) * 1000 > heartbeat_interval_ms:
            yield {"type": "heartbeat", "status": "working", "elapsed_ms": ...}
            last_event_time = time.monotonic()
        await asyncio.sleep(0.1)
```

Heartbeats prevent frontend disconnects and keep users informed during long background operations (see also `run-heartbeat-and-background-agent-ops.md`).

---

## 5. Trace Instrumentation

Add these spans to every agent run trace:

```python
with tracer.start_as_current_span("agent_run") as span:
    span.set_attribute("agent_id", agent.id)
    t0 = time.monotonic()

    with tracer.start_as_current_span("emit_first_status"):
        emit("run_started")                                   # → time_to_first_status_ms

    with tracer.start_as_current_span("context_assembly"):
        context = await assemble_context(...)                 # → context_assembly_ms

    with tracer.start_as_current_span("first_model_call"):
        async for token in model.stream(...):
            if first_token:
                record("time_to_first_token_ms", elapsed(t0)) # → time_to_first_token_ms
```

---

## 6. Alerting Thresholds

| Metric | Warning | Critical |
|---|---|---|
| `time_to_first_status_ms` p95 | > 500ms | > 1000ms |
| `hidden_work_ms` p95 | > 750ms | > 1500ms |
| `context_assembly_ms` p95 | > 500ms | > 1000ms |
| `status_gap_p95_ms` | > 2000ms | > 5000ms |
| `time_to_first_token_ms` p95 (simple tasks) | > 2000ms | > 4000ms |

---

## Source Notion Pages

- Performance of the AI Agents (agents are not slow to stream; they are slow to start user-visible work)
- Agent lifecycle (build → test → ship) (latency as a shipping gate)
- AI evals & regression checks (CI lane eval integration for latency metrics)
