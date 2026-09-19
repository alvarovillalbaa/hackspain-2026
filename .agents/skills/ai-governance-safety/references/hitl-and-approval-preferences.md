# HITL & Approval Preferences

Production safety architecture for human-in-the-loop confirmation: approval scopes, preference resolution, agents-as-tools propagation, and frontend renderability requirements.

**Use when:** designing or debugging any agent flow that pauses for human confirmation, approval, or preference-based routing.

**Do not use for:** generic agent safety governance (see `agent-governance-safety.md`) or tool confirmation policy schema (see `tool-call-design.md`).

**Related child skills:** `ai-governance-safety`, `agent-system-architecture`, `prompt-engineering`

**Required evals:** `hitl_block_renders_frontend`, `approval_preference_resolution`, `child_hitl_bubbles_to_parent`

---

## Runtime Invariant

No agent run may enter a blocked confirmation state unless the frontend receives a renderable confirmation payload over the stream before the block.

A run that pauses without emitting a confirmation event looks like a hang to the user. This is a safety and UX failure simultaneously.

---

## 1. Confirmation Scopes

| Scope | Description | Resolution priority |
|---|---|---|
| `user_confirmation` | Single user must approve before the action proceeds | 1 (highest) |
| `cross_user_approval` | A second user (reviewer, manager) must approve | 2 |
| `company_policy_approval` | Company-level policy gate; not individual user | 3 |
| `autonomy_preference_override` | User has opted into autonomous mode for this action class | Overrides 1–3 if risk ≤ threshold |

**Resolution rule:** higher-priority scopes win unless the autonomy override explicitly covers the action class and the action's risk level is within the approved threshold.

---

## 2. Approval Preference Architecture

Agents check `preferences_manage` before deciding whether to pause for confirmation.

```
action requested
        │
        ▼
lookup: preferences_manage(action_class, user_id, company_id)
        │
        ├── preference = auto + risk ≤ threshold → proceed without pause
        │
        ├── preference = confirm → emit confirmation event → pause run
        │
        └── preference = not set → apply tool's default confirmation_policy
```

**Never skip the preference lookup.** A user who has set autonomous mode for a low-risk action class expects no interruption. Ignoring the preference destroys trust.

---

## 3. Failure Modes

| Failure | Symptom | Root cause | Fix |
|---|---|---|---|
| Backend pauses, frontend shows nothing | Agent appears stuck or hung | Confirmation event not emitted over stream | Emit `confirmation_pending` event before blocking |
| Agent-as-tool hides child confirmation | Parent run waits indefinitely | Child HITL event not bubbled to parent run stream | Propagate child confirmation events upward through the run tree |
| Preference conflict | User expects auto; tool confirms | `preferences_manage` not consulted, or stale preference cache | Always query preference store; invalidate cache on `preferences_manage` write |
| Cross-user approver is unavailable | Run blocks indefinitely | No timeout on cross-user approval | Set approval TTL; escalate or auto-reject on timeout |
| Confirmation payload not renderable | Frontend receives event but cannot display UI | Payload schema mismatch between backend and frontend | Validate confirmation payload schema at emission point |

---

## 4. Agents-as-Tools: HITL Propagation

When a child agent (invoked as a tool by a parent agent) reaches a confirmation point, the HITL event must surface in the parent run's stream — not be silently absorbed by the child.

```
parent agent
    └── calls child_agent as tool
            └── child reaches confirmation gate
                    └── emits: { type: "confirmation_pending", scope: "user_confirmation", ... }
                            │
                            ▼
                    parent stream receives and re-emits event
                            │
                            ▼
                    frontend renders confirmation UI for parent run
```

**Anti-pattern:** child agent pauses internally and returns a timeout error to the parent. The user never sees the confirmation request and the run fails silently.

---

## 5. Confirmation Payload Schema

Every confirmation event must include:

```json
{
  "type": "confirmation_pending",
  "run_id": "<run_id>",
  "confirmation_id": "<unique_id>",
  "scope": "user_confirmation | cross_user_approval | company_policy_approval",
  "action_class": "<string>",
  "action_description": "<human-readable>",
  "risk_level": "low | medium | high",
  "timeout_seconds": 300,
  "options": ["approve", "reject", "modify"]
}
```

Frontend must be able to render this schema. If the schema changes, version it and maintain backward compatibility for one release cycle.

---

## 6. First-Meaningful-Update Latency

Agents are often perceived as slow not because they stream slowly, but because they start visible work too late. HITL is a special case: if the first user-visible event is a confirmation request, latency is the time from request → confirmation UI appearing.

- Emit `run_started` immediately on invocation.
- Emit `planning` or `thinking` status before context assembly.
- Emit `confirmation_pending` before blocking — never after.

See `agent-performance-and-first-token-latency.md` for the full latency playbook.

---

## 7. Eval Cases

| Case | Scenario | Expected | Fail condition |
|---|---|---|---|
| `hitl_block_renders_frontend` | Agent pauses for confirmation | `confirmation_pending` event in stream before block | Event absent or emitted after block |
| `child_hitl_bubbles_to_parent` | Child agent-as-tool reaches HITL | Parent stream contains child's confirmation event | Parent silently waits or times out |
| `autonomy_override_respected` | User preference = auto, risk = low | No confirmation pause | Pause occurs despite preference |
| `cross_user_timeout_escalation` | Cross-user approver inactive > TTL | Run escalates or auto-rejects | Run blocks indefinitely |

---

## Source Notion Pages

- Built-in HITL with Confirmation/Approval Preferences (HITL for agents-as-tools, preference architecture)
- Fixing AI Agents: QA (frontend not displaying HITL while agent run stops)
- preferences_manage tool call (confirmation/autonomous-agent preferences)
- Video Production on Replit: Test v1 (AI must ask before doing; approval payloads and checkpoints)
- Performance of the AI Agents (agents slow to start user-visible work, not slow to stream)
