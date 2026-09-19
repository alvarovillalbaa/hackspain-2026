# Run Heartbeat & Background Agent Operations

Operating model for background agents: heartbeat triggers, what-changed discovery, RunSteeringService integration, and user-visible progress requirements for long-running or asynchronous agent runs.

**Use when:** designing a background agent, adding heartbeat logic to an existing agent, or debugging a background run that appears to hang.

**Do not use for:** frontend event stream protocol (see `hitl-and-approval-preferences.md`) or general latency optimization (see `agent-performance-and-first-token-latency.md`).

**Related child skills:** `agent-system-architecture`, `ai-governance-safety`, `ai-evals-observability`

**Required evals:** `heartbeat_emits_on_schedule`, `background_run_surfaces_results`, `run_steering_responsive`

---

## 1. Background Agent Operating Model

A background agent runs without a user actively waiting for its output. It is triggered by:
- A schedule (cron, daily digest)
- An event (new item in a queue, webhook from external system)
- A completion of a prior agent run (chained background work)

Background agents must:
1. Emit a `run_started` event immediately on invocation (even if async/batch).
2. Surface results in a structured artifact or notification when complete.
3. Emit heartbeat events during long work so the system knows the run is alive.
4. Handle interruption cleanly — checkpoint state before any long tool call.

---

## 2. Heartbeat Triggers

A heartbeat is a progress event emitted by the agent to signal it is still working. It is not a user-facing message — it is an infrastructure signal.

```python
HEARTBEAT_INTERVAL_MS = 2000  # emit at least every 2s during active work

async def run_background_agent_with_heartbeat(agent_run):
    last_heartbeat = time.monotonic()
    async for event in agent_run.stream():
        yield event
        if (time.monotonic() - last_heartbeat) * 1000 > HEARTBEAT_INTERVAL_MS:
            yield {
                "type": "heartbeat",
                "run_id": agent_run.run_id,
                "status": "working",
                "elapsed_ms": int((time.monotonic() - agent_run.start_time) * 1000),
                "last_step": agent_run.current_step
            }
            last_heartbeat = time.monotonic()
```

**Infrastructure uses heartbeats to:**
- Detect stalled runs (no heartbeat for > 60s → alert + potential restart)
- Update run status in the UI ("In progress — 45s elapsed")
- Decide when to send a push notification ("Run still going, will notify when done")

---

## 3. What-Changed Discovery Pattern

Background agents that run on a schedule need to know what has changed since their last run. This is the "what changed since yesterday" pattern.

```
on trigger:
    1. Load automation memory: last_run_timestamp, last_processed_item_id
    2. Query: items created or updated since last_run_timestamp
    3. Filter: items not in last_processed_item_id set
    4. Process delta only
    5. Update automation memory: last_run_timestamp = now, last_processed_item_id = this run's items
```

**Examples of what-changed discovery:**
- Interview debrief agent: candidates with interviews completed since last run, no debrief recorded
- Offer follow-up agent: offers sent > N days ago with no response
- Report agent: metrics changed by > threshold since last digest
- Inbox triage agent: messages unread since last triage run

**Rule:** never reprocess items already handled in a prior run unless explicitly triggered to do so. Idempotency is the responsibility of the background agent, not the trigger system.

---

## 4. RunSteeringService Integration

For background runs that need mid-run control (pause, cancel, priority change), integrate with RunSteeringService.

```python
class BackgroundAgentRun:
    def __init__(self, run_id: str, steering_service: RunSteeringService):
        self.run_id = run_id
        self.steering = steering_service

    async def check_steering(self):
        directive = await self.steering.get_directive(self.run_id)
        if directive.action == "cancel":
            raise RunCancelledError(directive.reason)
        if directive.action == "pause":
            await self.checkpoint_state()
            await self.steering.signal_paused(self.run_id)
            await self.steering.wait_for_resume(self.run_id)
```

**Call `check_steering()` before every long tool call.** A run that cannot be cancelled or paused during a multi-minute background operation is a reliability and safety risk.

---

## 5. Checkpointing

Before any long tool call, checkpoint the agent's current state so a cancelled or failed run can be resumed.

```python
async def checkpoint(self, label: str):
    state = {
        "step": self.current_step,
        "processed_items": self.processed_item_ids,
        "pending_items": self.pending_item_ids,
        "run_memory_snapshot": self.run_memory.snapshot()
    }
    await self.state_store.write(
        key=f"run_checkpoint/{self.run_id}/{label}",
        value=state,
        ttl_seconds=3600
    )
```

**Checkpoint labels:** use meaningful names (`after_retrieval`, `after_planning`, `before_write`). These appear in traces and make resume logic readable.

---

## 6. Result Surfacing

Background agent results must surface somewhere the user can find them without polling. Options:

| Mechanism | Use when |
|---|---|
| Push notification | User expects a result within minutes; mobile or desktop notification |
| In-app notification / inbox | Result is one of many items in a digest or triage run |
| Structured artifact | Result is a document, report, or structured record (create it in the relevant location) |
| Thread reply | Background run was spawned from a user conversation; reply in the thread |

**Never silently complete a background run with no user-facing artifact.** Even a one-line "Checked 42 items, 3 need your attention" notification is better than silence.

---

## 7. Eval Cases

| Case | Scenario | Expected | Fail |
|---|---|---|---|
| `heartbeat_emits_on_schedule` | Background run > 2s | Heartbeat event in stream within 2s intervals | No heartbeat for > 5s during active work |
| `what_changed_idempotent` | Run twice on same data | Second run processes 0 items | Second run reprocesses first run's items |
| `checkpoint_on_cancel` | Cancel mid-run | State checkpointed before cancel error | No checkpoint; partial state lost |
| `result_surface_present` | Background run completes | Notification or artifact created | Silent completion |

---

## Source Notion Pages

- Agent lifecycle (build → test → ship) (background agent operations and RunSteeringService)
- Agents (canonical hub: memory layers, operational concerns)
- Performance of the AI Agents (first-visible-work latency; emit status early)
- Introduce Automation Memory and Space Memory (automation_memory scope for what-changed tracking)
