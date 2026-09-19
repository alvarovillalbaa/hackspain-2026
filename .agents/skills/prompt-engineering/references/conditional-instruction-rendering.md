# Conditional Instruction Rendering

Engineering rules for rendering only the system prompt sections that are relevant to the agent's actual capabilities and topology.

**Use when:** assembling or debugging a system prompt — especially when an agent is receiving multi-agent, memory, or HITL instructions it doesn't need.

**Do not use for:** generic prompt formatting rules (see `system-prompt-architecture.md`) or tool schema design (see `tool-call-design.md`).

**Related child skills:** `prompt-engineering`, `agent-system-architecture`

**Required evals:** `prompt_section_relevance`, `capability_not_hallucinated`

---

## Core Rule

Do not render every prompt section for every agent. Each section should be gated on whether the agent actually has the capabilities that section describes.

An irrelevant section does not just waste tokens — it misleads the model into assuming capabilities it does not have, producing phantom routing decisions, false confirmation loops, and confused tool selection.

---

## 1. Condition Matrix

| Prompt section | Render when |
|---|---|
| Memory / Learning | Agent has `memories_manage`, `mental_state_manage`, `content_search`, `memory_search`, or any learning tool |
| Multi-Agent System | Agent has `handoffs`, `agents_as_tools`, `self_subagent_run`, or parallel orchestration enabled |
| Human Reviews / HITL | Any reachable tool has `confirmation_policy != auto` |
| MCP | Agent has at least one MCP provider or MCP-sourced tool exposed |
| Personalization | User/company/space/dynamic SPL exists and is non-empty |
| Domain Rules | Agent operates in a product domain with specific policy constraints |
| Fine-Tuning / Learning Loop | Agent participates in the annotation pipeline or reflection candidate cycle |

---

## 2. Anti-Patterns

**Render all, filter nothing**
Every agent gets the full system prompt template including memory, multi-agent, and HITL sections. Result: a single-purpose document-summary agent believes it can coordinate sub-agents and will attempt handoffs that don't exist.

**Hardcode sections in the prompt string**
System prompt is a static string with all blocks present. Behavioral changes require edits to the prompt file rather than toggling capability flags. Scaling to 20+ agent types becomes unmanageable.

**Check capabilities at runtime but not at assembly**
The agent suppresses tool calls it lacks, but the prompt still instructs it on memory retrieval and handoff coordination. The model may still hallucinate capability-based reasoning ("I should store this in memory...") even when no memory tools are present.

---

## 3. Implementation: Capability-Gated Assembly

Treat each prompt section as a conditional block. Assembly reads the agent's capability manifest and includes only matching sections.

```python
def assemble_system_prompt(agent: AgentConfig, spl: SPLContext) -> str:
    blocks = [identity_block(agent), capabilities_block(agent), guardrails_block(agent)]

    if has_any_tool(agent, MEMORY_TOOL_NAMES):
        blocks.append(memory_block(agent, spl))

    if agent.topology in ("handoffs", "agents_as_tools", "parallel", "self_subagent"):
        blocks.append(multi_agent_block(agent))

    if any_tool_requires_confirmation(agent):
        blocks.append(hitl_block(agent))

    if agent.mcp_providers:
        blocks.append(mcp_block(agent))

    if spl.has_personalization:
        blocks.append(personalization_block(spl))

    blocks.append(output_format_block(agent))
    return "\n\n".join(blocks)
```

**Naming convention:** capability sets are stable identifiers (`MEMORY_TOOL_NAMES`, not inline strings). This makes section gating testable in isolation.

---

## 4. Prompt Caching Failure Mode

**Symptom:** Prompt cache hits correctly but system-level instructions are absent from the model's behavior.

**Root cause:** The assembler places system instructions inside a `user`-role message rather than the `system` message field. Under prompt caching, the system message is the cache anchor — instructions outside it are dropped when the cached turn is replayed.

**Fix:** Always place the assembled system prompt in the `system` field, not as a leading `user` message. If the API being used doesn't support a `system` field (e.g., older completions APIs), use a `{"role": "system", ...}` entry as the first message and never inside a user turn.

```python
# Wrong — instructions may be dropped on cache replay
messages = [
    {"role": "user", "content": system_prompt + "\n\nUser: " + user_input}
]

# Correct — system is a stable cache anchor
messages = [
    {"role": "system", "content": system_prompt},
    {"role": "user", "content": user_input}
]
```

---

## 5. Eval Cases

| Case | Input | Expected | Fail condition |
|---|---|---|---|
| `no_memory_no_memory_section` | Agent with no memory tools | Prompt has no memory block | Memory instructions present |
| `single_agent_no_multiagent_section` | Single-agent config | Prompt has no multi-agent block | Handoff/routing instructions present |
| `hitl_tool_present_hitl_rendered` | Agent with `confirm_action` tool | Prompt includes HITL block | HITL block absent |
| `cache_system_field` | Assembled prompt | `system` field populated, not user message | System instructions in user turn |

---

## Source Notion Pages

- System Prompt Instructions v3.1 (conditional multi-agent/HITL sections, capability-gated memory rendering)
- Prompt & instructions operations (minimal-fix levers, avoid duplication)
- Prompt Caching review (batch request cache failure mode)
