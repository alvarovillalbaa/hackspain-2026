# Memory Scope & Recitation

Operational memory scope taxonomy and the recitation protocol for using memory correctly inside an agent run.

**Use when:** designing memory retrieval for a new agent, debugging incorrect memory usage, or adding `space` or `automation`-scoped memory to an existing agent.

**Do not use for:** memory tier persistence architecture (see `memory-and-system.md`) or cross-run memory schema design.

**Related child skills:** `context-engineering`, `prompt-engineering`, `agent-system-architecture`

**Required evals:** `memory_scope_isolation`, `recitation_freshness`, `staleness_conflict_detection`

---

## 1. Memory Scope Taxonomy

| Scope | Use | Isolation boundary | Freshness |
|---|---|---|---|
| `run` | Current execution scratchpad; tool outputs, reasoning, sources | Dropped at run end | Always fresh |
| `thread` | Session continuity across turns within one conversation | Cleared on new session | Fresh within session |
| `user` | User preferences, corrections, and personal context | Per user_id | May go stale; check recency |
| `company` | Company-wide lessons, policies, and norms | Per company_id | Stable; versioned |
| `space` | Workspace or project-specific grounding context | Per space_id | Changes with space state |
| `automation` | Recurring workflow-specific memory (e.g., "weekly report" knows last run state) | Per automation_id | Checked at automation trigger |
| `global_pattern` | Generalized memory derived from patterns across many memories | Shared; read-only for agents | Slow-changing; model-managed |

**Rule:** always use the narrowest applicable scope. An agent operating inside a space must use `space`-scoped memory, not `user`-scoped memory, to avoid leaking context across unrelated projects.

---

## 2. Space Memory

Space memory grounds an agent to the specific project or workspace it is operating in. Without it, an agent may apply user preferences from an unrelated context or recall lessons that are project-specific as if they were universal.

```
space_memory:
  space_id: <space_id>
  keys:
    - project_goals
    - team_members
    - active_constraints
    - recent_decisions
    - linked_resources
```

**Render condition:** inject space memory block only when the agent is invoked within a space context (i.e., `space_id` is present in the invocation payload). See `conditional-instruction-rendering.md`.

---

## 3. Automation Memory

Automation memory allows a recurring workflow to remember its own state across runs: what it processed last time, what was skipped, what requires follow-up.

```
automation_memory:
  automation_id: <automation_id>
  keys:
    - last_run_timestamp
    - last_processed_item_id
    - pending_follow_ups
    - error_items_from_last_run
```

**Render condition:** inject automation memory block only when the agent is triggered by an automation (i.e., `automation_id` is present in the trigger payload).

---

## 4. Recitation Protocol

Before acting on any constraint, preference, or fact retrieved from memory, the agent must recite the memory explicitly. This prevents the model from hallucinating a memory it didn't actually retrieve, and makes memory usage auditable in traces.

```
Step 1: Retrieve
  → Call memory_search or memories_manage with relevant query

Step 2: Recite in structured form
  → In run_memory or internal monologue:
    "Retrieved memory: [scope=user] User prefers concise responses under 3 paragraphs.
     Retrieved on: <timestamp>. Source: cross_run_memory key=response_length_preference."

Step 3: Check freshness and conflict
  → Is this memory older than the freshness threshold for this scope?
  → Does it conflict with the current context (e.g., user just said the opposite)?

Step 4: Act or ask
  → Fresh, no conflict: apply the memory
  → Stale or conflicting: surface the conflict to the user or discard and ask
```

---

## 5. Staleness & Conflict Rules

| Scope | Freshness threshold | On conflict |
|---|---|---|
| `run` | Always fresh (current execution) | N/A |
| `thread` | Fresh within session | Prefer current turn's statement |
| `user` | 30 days (preferences); 7 days (corrections) | Ask user to confirm |
| `company` | 90 days (policies) | Escalate if high-stakes |
| `space` | Checked at space context load | Prefer space state over user memory |
| `automation` | Checked at automation trigger | Prefer trigger-time state |
| `global_pattern` | 180 days | Treat as guidance; do not override explicit user instruction |

---

## 6. Capability-Conditioned Prompt Rendering

Memory sections should only appear in the system prompt when the agent actually has memory tools. See `conditional-instruction-rendering.md` for the full condition matrix.

| Tool capability | Memory sections to render |
|---|---|
| `memories_manage` | User memory, company memory, cross-run memory |
| `mental_state_manage` | Run memory block, recitation instructions |
| `content_search` or `memory_search` | Retrieval instructions, freshness check protocol |
| `space_context_read` | Space memory block |
| `automation_state_manage` | Automation memory block |

---

## 7. Eval Cases

| Case | Scenario | Expected | Fail condition |
|---|---|---|---|
| `scope_isolation_space` | Agent in space A retrieves memory | Only space A memories returned | Space B or user global memories returned |
| `recitation_before_action` | Agent uses a retrieved preference | Recitation present in trace before action | No recitation; direct action |
| `staleness_flag` | Memory > freshness threshold | Agent flags staleness or asks user | Agent acts on stale memory silently |
| `automation_state_persisted` | Automation runs twice | Second run reads first run's `last_run_timestamp` | Second run treats state as empty |

---

## Source Notion Pages

- [REVIEW] Short-term Memory in-agent run — Recitation (recitation approach and when to retrieve)
- reflections/ in Memory (reflections as learning artifacts)
- Analyze & Improve Learning System (scope: user vs company, retrieval/write flows)
- Introduce Automation Memory and Space Memory (memory scoped to spaces/automations)
- System Prompt Instructions v3.1 (memory section render-gating by capability)
