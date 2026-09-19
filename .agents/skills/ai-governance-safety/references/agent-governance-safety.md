# Agent Governance & Safety

Control architecture for autonomous agents that pursue goals, use tools, remember, collaborate, and affect external systems.

---

## 1. Why Agent Governance Differs from Chatbot Safety

Agents differ from chatbots in four dimensions that expand both usefulness and control surface:

| Capability | Expands usefulness | Expands control surface |
|------------|-------------------|------------------------|
| Reasoning / planning | Multi-step problem solving | Brittle plans, error compounding |
| Memory (cross-run) | Personalization, persistence | Stale data acting on users |
| Tool use | Real-world actions | Irreversible mutations |
| Multi-agent interaction | Parallelism, specialization | Opaque action chains |

**Deployment principle**: distinguish capability spikes from robust autonomy. Short, scoped tasks are safer than long-horizon ones. Deploy with autonomy levels matching demonstrated reliability, not theoretical capability.

---

## 2. Risk Taxonomy

### Malicious use
- Lower cost/skill barrier for disinformation, cyber offense, and dual-use workflows.
- Design: rate limits, tool scope restrictions, audit trails.

### Accidents and loss of control
- Persistent tool users compound errors and create opaque action chains.
- Correction: rollback capability, max_turns limits, human-in-the-loop gates.

### Security
- Memory, APIs, tools, and inter-agent protocols expand prompt-injection and compromise surfaces.
- Mitigations: input sanitization, guardrail services, scoped tool access.

### Systemic risks
- Labor displacement, power concentration, surveillance, market instability.
- Applied in product: data access scoping, explicit autonomy consent, company-boundary enforcement.

---

## 3. Core Bottlenecks to Design Around

| Bottleneck | Manifestation | Design response |
|-----------|--------------|-----------------|
| Hallucination | Agent cites non-existent records | Groundedness eval gate; RAG-first |
| Brittle plans | Single tool failure aborts entire task | Plan-Execute with fallback; max_turns guard |
| Tool-use fragility | Wrong tool called under uncertainty | Intern Test on tool descriptions; eval case |
| Recovery failures | Agent loops or freezes on error | Error injection in run_memory; RunSteeringService |
| Expensive inference | Cost blowout on long runs | Context compaction; tool output persistence policies |
| Limited long-horizon reasoning | Success rate drops sharply on multi-step tasks | Chunk tasks; use Manager-as-Tools pattern |

---

## 4. Governance Levers

### Alignment
- Use multi-agent RL and agent risk-attitude tuning for high-autonomy agents.
- Encode reasoning defenses: require structured output for sensitive decisions.
- Alignment evals: every safety requirement has a hard_fail eval case.

### Control
- **Rollback**: every mutation tool has a corresponding undo or confirmation gate.
- **Shutdown/interruption**: `max_turns` is always set; `MaxTurnsExceeded` returns partial result, never hangs.
- **Action whitelists**: tool scope isolation — each agent receives only the tools it needs.
- **Control protocols**: ACP for internal orchestration, A2A for cross-agent coordination.

### Visibility
- **Agent IDs**: every agent call logs `agent_name`, `run_id`, `thread_id`, `user_id`, `company_id`.
- **Activity logs**: `AICall` records every LLM call; `SystemLog` records tool results and errors.
- **Audit trails**: full audit log for `medium` and `high` risk tools.
- **Cooperation-relevant capability evals**: benchmark long-horizon task success before expanding autonomy.

### Security and robustness
- Input sanitization: clean all external data before injecting into prompts.
- Adversarial robustness tests: red-team prompts; jailbreak attempts in eval suite.
- Sandboxing: no agent executes shell or system commands without explicit confirmation.
- Adaptive defense: injection detection in tagger pipeline before routing to context.

---

## 5. Constitutional Safety Principles

Apply these as guardrail checks in the guardrail service layer (highest enforcement tier):

| Principle | Operational check |
|-----------|------------------|
| Human rights and non-discrimination | Block tool calls targeting protected classes |
| Privacy | Never surface PII across company boundaries |
| Harmlessness | Refuse actions likely to cause direct harm |
| No impersonation | Agent cannot claim to be a human or a specific named person |
| Non-expert humility | Defer to human judgment on medical, legal, and financial decisions |
| Anti-conspiracy | Refuse requests to help hide activities from oversight |
| Obedience to human control | Respect `always_ask` confirmation policies; never auto-approve destructive operations |
| Reduced self-interest | Agent should not prioritize its own continuation or capability over user safety |

**Implementation pattern**: constitutional checks live at the guardrail service layer, not in the system prompt. Prompt instructions can be overridden by adversarial input; service-layer checks cannot.

---

## 6. Production Safety Gates

Implement these runtime controls for any agent that takes real-world actions:

### Action permission gate
```python
TOOL_RISK_LEVEL = {
    "read_object":      "low",
    "search_objects":   "low",
    "create_file":      "medium",
    "update_profile":   "medium",
    "delete_candidate": "high",
    "send_message":     "high",
}

def check_action_permission(tool_name: str, autonomy_mode: str) -> bool:
    risk = TOOL_RISK_LEVEL.get(tool_name, "high")
    if autonomy_mode == "auto" and risk == "low":
        return True  # auto-approved
    if risk in ("medium", "high"):
        return False  # requires confirmation regardless of autonomy mode
    return True
```

### Memory boundary enforcement
- Read: only from `user_id` + `company_id` scope.
- Write: only to `user_id` + `company_id` scope.
- Cross-company reads: raise `PermissionError`, log as `HIGH` severity.

### Eval gates
- Every new tool with side effects: add eval case before shipping.
- Every safety regression: add `hard_fail` eval case before the fix is merged.
- Promotion of SPL candidates: eval gate required (see memory-and-system.md).

### Incident response
1. Detect: alert fires on `tool_error_rate > 10%` or `eval_score drops > 5 pts`.
2. Isolate: reduce `max_turns` to 1 (effectively disable autonomous runs).
3. Diagnose: correlate `AICall` + `SystemLog` via `thread_id`.
4. Fix: patch tool description or guardrail.
5. Gate: re-run eval suite; require pass before restoring `max_turns`.

---

## 7. Autonomy Level Design

New agents always start at `standard`. Promote to `auto` only after:
- Eval coverage established for all tools in the agent's tool set.
- User has explicitly opted in (`user.settings.config.agents.autonomous = True`).
- Long-horizon benchmark shows >80% success rate on representative tasks.

```
standard (default)
  → all medium/high-risk operations pause for confirmation
  → realtime modality always stays here (never auto)

auto (opt-in)
  → low-risk tools execute without confirmation
  → medium/high-risk tools still require confirmation
  → user can revoke any time
```

**Never grant blanket auto-approval for all tools**. Even in `auto` mode, `delete` and `send_message` class operations require explicit confirmation.

---

## 8. Scope Boundaries (Data Isolation)

All agent data access must be scoped. Violations are treated as security incidents:

| Boundary type | Enforcement | Violation severity |
|--------------|-------------|-------------------|
| Company isolation | All queries include `company_id` filter | CRITICAL |
| User isolation | Memory reads scoped to `user_id` within company | HIGH |
| Thread isolation | `thread_id` used for BDI and run_memory | MEDIUM |
| Tool scope | Each agent receives only its assigned tools | MEDIUM |

```python
# Correct: company-scoped query
results = store.query(
    vector=embedding,
    filter=with_active_vector_filter({"company_id": str(company_id)}),
)

# WRONG: no scope filter
results = store.query(vector=embedding)  # can return any company's data
```

---

## 9. Prompt Injection Defense

Agents that process external content (emails, documents, web data) are vulnerable to prompt injection — content that attempts to override agent instructions.

**Defense layers:**

1. **Tagger pre-filter**: classify incoming content before injecting into prompt. Suspicious patterns flagged as `injection_risk` and logged.

2. **Instruction isolation**: hard instructions are in the system prompt with explicit priority notation. Content is injected into `<user_content>` tags, not instruction blocks.

3. **Tool confirmation gate**: even if injected content successfully manipulates tool calls, `always_ask` confirmation catches destructive operations before execution.

4. **Output validation**: agent outputs are checked for data exfiltration patterns (e.g., structured data unexpectedly in response text).

5. **Eval cases**: include prompt injection attempts in eval suite as `hard_fail` cases.

---

## 10. Agent Capability Checklist

Before expanding agent autonomy (adding tools, raising max_turns, enabling auto mode):

- [ ] Eval coverage exists for every new tool
- [ ] Long-horizon benchmark run with representative tasks
- [ ] Prompt injection red-team tests passed
- [ ] Memory boundary tests passed (no cross-company data)
- [ ] All high-risk tools have `always_ask` confirmation policy
- [ ] Incident response runbook updated for new tool failure modes
- [ ] Rollback mechanism documented for every mutation the agent can perform
- [ ] Autonomy change documented in agent changelog

**Rule**: governance regression is a deploy blocker. A safety eval failure must be fixed before shipping the capability, not after.
