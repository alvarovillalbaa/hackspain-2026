# AI Observability

Instrumentation, trace standards, correlation IDs, metrics, and alerting patterns for production AI agent systems.

---

## 1. Observability Layers for AI Systems

AI systems require instrumentation at three distinct layers, all correlated by shared IDs:

```
Layer 1: Infrastructure
  └── Celery task status, DB queries, Redis, WebSocket connections

Layer 2: Agent Execution
  └── TTFT, token usage, tool call success/failure, streaming events

Layer 3: AI Quality (unique to AI systems)
  └── Eval scores, memory correctness, groundedness, task completion
```

Classic infrastructure monitoring catches Layer 1. Layers 2 and 3 require AI-specific instrumentation.

---

## 2. Trace Standard

Every agent run produces a structured trace. The canonical schema:

### Root Object
```json
{
  "version": "1.0",
  "agent": {
    "name": "assistant",
    "variant": "full",
    "model": "openai/gpt-5.2",
    "autonomy": "stream"
  },
  "progress_updates": [...],
  "reasoning_chunks": [...],
  "context_summaries": [...],
  "usage": {
    "input_tokens": 1500,
    "output_tokens": 350,
    "model": "openai/gpt-5.2"
  }
}
```

### TraceEntry (base schema for all events)
```json
{
  "id": "uuid4",
  "type": "tool_call | agent_start | agent_end | error | ...",
  "timestamp": "2026-02-18T10:00:00Z",
  "source": "component-name",
  "agent": "sub-agent-name",
  "content": "...",
  "metadata": {}
}
```

### TraceAgentMeta
| Field | Description |
|-------|-------------|
| `name` | Agent name: `"assistant"`, `"cdo"`, etc. |
| `variant` | Agent variant: `"full"`, `"lite"` |
| `model` | LLM model used: `"openai/gpt-5.2"` |
| `autonomy` | Execution mode: `"stream"`, `"task"`, `"batch"` |

### progress_updates
Lifecycle events: agent start/end, tool calls, status transitions, confirmation gates.

### reasoning_chunks
Internal reasoning captured during execution. Useful for debugging unexpected decisions.

### context_summaries
Context decisions and domain-level evaluations (e.g., HR domain relevance scoring).

### usage
Per-run token consumption. Essential for cost attribution.

---

## 3. Correlation ID System

Every event must carry the full correlation chain. Never log an AI failure without these IDs:

| ID | Scope | Description |
|----|-------|-------------|
| `thread_id` | Conversation thread | Ties all turns in a conversation |
| `run_id` | Single agent execution | Ties all events in one agent run |
| `trace_id` | Trace model row | Links to the structured trace record |
| `conversation_id` | Individual message | Ties request + response |
| `user_id` | User | Scopes events to a specific user |
| `company_id` | Company/workspace | Scopes events to a company |
| `task_id` | Celery task | Ties async execution back to request |

**Correlation rule:** log ALL of these IDs in every AI-related log entry. An incident that can only be correlated by one ID is nearly impossible to diagnose under concurrency.

---

## 4. Key AI-Specific Metrics

### Performance Metrics

| Metric | Description | Alert threshold |
|--------|-------------|-----------------|
| `ttft_ms` | Time to first streaming token | Alert if P95 > 2× baseline |
| `total_latency_ms` | Request start → final response | Alert if P95 > 3× baseline |
| `context_assembly_ms` | Time to build LLM context | Alert if > 500ms (indicates bloat) |
| `tool_execution_ms` | Per-tool execution time | Alert if P99 > 5s |
| `session_compaction_triggered` | Count of context compaction events | Alert if rising trend |

### Token Economics

| Metric | Description |
|--------|-------------|
| `input_tokens_per_run` | Prompt tokens consumed per agent run |
| `output_tokens_per_run` | Completion tokens generated per agent run |
| `token_cost_per_user` | Estimated cost per user per session |
| `input_tokens_trend` | Rising input tokens = context bloat signal |

**Cost attribution:** tag every `AICall` record with `user_id`, `company_id`, `workflow_slug` for cost-per-feature reporting.

### Tool Quality

| Metric | Description | Alert threshold |
|--------|-------------|-----------------|
| `tool_success_rate` | % of tool calls that succeed | Alert if < 90% for any tool |
| `tool_error_rate_by_name` | Per-tool error rate | Alert if any tool > 5% errors |
| `tool_retry_count` | Retries per tool call | Alert if > 1 retry/call average |
| `wrong_tool_rate` | Tool selection errors (from evals) | Alert if rising |
| `confirmation_abandon_rate` | Users abandoning confirmation dialogs | Alert if > 30% |

### AI Quality (Eval-Derived)

| Metric | Description | Alert threshold |
|--------|-------------|-----------------|
| `eval_score_by_slug` | Rolling eval score per capability | Alert if drops > 5 pts |
| `groundedness_rate` | % of responses grounded in context | Alert if < 80% |
| `memory_staleness_rate` | % of memory retrievals that conflict with context | Alert if > 5% |
| `spl_update_frequency` | SPL block updates per week | Alert if zero (system may be stalled) |

---

## 5. AICall Record

Every LLM call is logged as an `AICall` record. Key fields for observability:

```python
# Querying recent calls for a capability
AICalls = AICall.objects.with_call_status("succeeded").filter(
    type="chat",
    metadata__workflow_slug="assistant",
    created_at__gte=seven_days_ago,
)
```

| Field | Observability use |
|-------|------------------|
| `type` | Filter by call type (chat, embedding, completion) |
| `metadata.workflow_slug` | Filter by capability/agent |
| `metadata.is_ground_truth` | Identify golden examples |
| `user_id`, `company_id` | Cost attribution |
| `call_status` | Filter succeeded/failed |

---

## 6. SystemLog for AI Events

Use `SystemLogService` for structured error logging across the AI stack:

```python
from services.system.logs_service import SystemLogService, log_error, log_warning

# Tool execution failure
log_error(
    module="services.ai.agents.tools",
    function="execute_tool",
    message="Tool call failed after retry",
    error_type=SystemLogService.ERROR_TYPES["TOOL_ERROR"],
    extra_data={
        "tool_name": tool_name,
        "thread_id": thread_id,
        "run_id": run_id,
        "attempt": retry_count,
    },
)
```

**Log categories for AI:**
- `TOOL_ERROR` — tool execution failures
- `VALIDATION_ERROR` — input/output validation failures
- `TIMEOUT_ERROR` — model or tool timeouts
- `AUTH_ERROR` — MCP or provider auth failures

---

## 7. Runtime User Events

The `RuntimeUserEventService` captures UI events for live agent recitation and experience memory:

```python
from services.ai.agents.runtime_events import RuntimeUserEventService, EXPERIENCE_SUBTYPES

# EXPERIENCE_SUBTYPES for context:
# "navigation", "object_view", "object_mutation", "share",
# "canvas_share", "permission", "feedback", "feedback_detail",
# "source_click", "widget_confirmation", "workflow_control"
```

- Events cached for 24h (TTL), limited to 80 per thread
- First 30 events available for live recitation within an agent run
- `experience.ui_event` metric key for aggregated analytics

**Why this matters for observability:** UI events correlated with agent runs reveal whether the agent's actions align with what users actually click and do next. A high `source_click` rate after a response suggests the agent didn't answer fully; a high `feedback` rate suggests quality issues.

---

## 8. Eval Score Observability

Eval scores are the most important AI-specific metric. Treat them like error rates.

```python
# Track eval score trends over time
MetricsService().record_metric(
    key="eval_score",
    value=ci_gate_score,
    properties={
        "slug": eval_slug,
        "mode": eval_mode,
        "model": model_id,
        "threshold": threshold,
        "passed": gate_passed,
    },
    object_id=eval_run_id,
)
```

**Dashboard requirements for AI systems:**
1. Eval score trend per capability slug (rolling 7/30 days)
2. Hard-fail vs soft-fail breakdown
3. Score delta on deploy (compare pre/post deployment baseline)
4. Token usage trend (input/output)
5. Tool error rate by tool name
6. TTFT percentiles (P50, P95, P99)

---

## 9. Alert Patterns

| Alert | Signal | Severity |
|-------|--------|---------|
| Eval score drop > 5 pts | Quality regression | Critical — block deploy |
| Hard eval gate fail | Blocking quality gate | Critical |
| Tool error rate > 10% | Tool reliability | High |
| TTFT P95 > 2× baseline | Context bloat / model issue | High |
| Context compaction rate spike | Context growth | Medium |
| Memory staleness rate > 5% | Stale cross_run_memory | Medium |
| SPL update rate zero for 14 days | Learning system stalled | Low |
| Fine-tuning job stuck | Pipeline failure | Medium |

---

## 10. Debugging with Traces

Step-by-step trace-based diagnosis:

1. **Get the trace** for a failing run:
   ```python
   trace = Trace.objects.filter(
       message__thread_id=thread_id,
       subtype__in=["agent_run", "tool_call", "error"]
   ).order_by("created_at")
   ```

2. **Correlate with AICall** for token usage and timing:
   ```python
   aicall = AICall.objects.filter(metadata__run_id=run_id).first()
   ```

3. **Find the failure point** in `progress_updates`:
   - Look for the last successful event before the failure
   - Check if a tool call preceded the failure
   - Check if a confirmation gate was abandoned

4. **Check reasoning_chunks** if the model made an unexpected decision:
   - Was the wrong context present in `context_summaries`?
   - Was a critical constraint absent from the reasoning?

5. **Cross-reference with SystemLog**:
   ```python
   SystemLog.objects.filter(
       extra_data__thread_id=thread_id
   ).order_by("created_at")
   ```
