# Tool Call Design

Designing tool schemas, descriptions, categories, confirmation policies, and persistence strategies for production agent systems.

## Core Principle

Tool design is the highest-leverage surface in agent engineering. A tool with a precise, unambiguous description and clear side-effect contract reduces hallucinated calls, wrong-tool selection, and confirmation noise far more than prompt-level guidance.

---

## 1. The Intern Test

Before writing a tool description, apply the Intern Test:

> "If a new engineer on day one read only this description and had to decide whether to call this tool, would they call it in the wrong situation?"

If yes, the description fails. Common failure modes:
- Ambiguous naming: `get_data` vs `read_object` vs `search_objects`
- Missing "do NOT use for X" disambiguation clause
- No mention of side effects (mutations, confirmations triggered)
- Vague parameter descriptions ("id: string — the ID")

---

## 2. Tool Description Template

```
### {tool_name}

{One-line what it does — always start with a verb}

Use when: {condition that triggers this tool, not the action}
Do NOT use for: {disambiguation from the most likely wrong choice}
Side effects: {mutations / confirmations / async actions triggered — or "read-only"}

Parameters:
- {param_name} ({type}): {precise description with valid values or format}
- {param_name} ({type}, optional): {description and default behavior}

Returns: {what the caller receives and should do with it}
```

**Example (good):**
```
### search_objects

Semantic full-text search over user-scoped objects.

Use when: the user asks about a topic and you need to find related items
    without knowing their IDs.
Do NOT use for: fetching a known object by ID (use read_object).
    Listing all objects of a type (use list_objects).
Side effects: read-only.

Parameters:
- query (str): Natural language search query. Do not reformulate into SQL or keywords.
- object_type (str): One of "job", "candidate", "company", "message".
- limit (int, optional): Max results. Default 10, max 50.

Returns: List of objects with relevance scores. Check score before citing.
```

---

## 3. Tool Category Taxonomy

Tool categories drive streaming behavior, confirmation gates, and logging. Assign the most restrictive category that fits.

| Category | Description | Streaming | Confirmation |
|----------|-------------|-----------|--------------|
| `read_objects` | Fetch known object by ID | output | none |
| `list_objects` | Enumerate objects of a type | output | none |
| `search_objects` | Semantic search across objects | output | none |
| `memory_tools` | Read/write agent memory | none | none |
| `helper_tools` | Internal utilities (reason, specify) | none | none |
| `resource_tools` | External resource access | output | none |
| `canvas_tools` | Async canvas/artifact generation | both | none |
| `update_confirmation` | Mutates existing record; blocks for confirm | args | always_ask |
| `create_confirmation` | Creates new record; blocks for confirm | both | always_ask |
| `schedule_confirmation` | Schedules a future task; blocks for confirm | both | always_ask |
| `workflow_confirmation` | Triggers async background workflow | args | configurable |
| `auth_confirmation` | Requests OAuth authentication from user | args | always_ask |
| `ai_as_a_tool` | Calls another LLM; tokens stream separately | none | none |
| `agent_as_a_tool` | Delegates to a sub-agent | none | configurable |
| `hosted_mcp_tool` | Remote MCP server via delegated execution | both | configurable |

**Rule**: if the tool mutates any persistent state, use `update_confirmation` or `create_confirmation`. Never use `helper_tools` or `read_objects` for mutating operations.

---

## 4. Confirmation Policies

| Policy | When to use |
|--------|-------------|
| `none` | Read-only; no user-visible side effects |
| `always_ask` | Every call pauses for explicit user approval |
| `always_auto` | System-trusted tools that never need confirmation |
| `configurable` | User or company setting determines behavior |

**Confirmation element**: name the UI component that renders the confirmation dialog. Keep it stable — changing it breaks existing confirmation flows.

---

## 5. Persistence Policies

Tool outputs are not equal. Assign a persistence policy to prevent context pollution:

| Policy | Lifetime | When to use |
|--------|----------|-------------|
| `ephemeral` | Until next tool call | Low-signal utilities: list, reason, specify, contextualize |
| `session` | Until end of agent session | Items user may reference again: read_object, plan, review |
| `short_term` | Summarized and kept across runs | Heavy mutations, long blobs: create_file, update_profile |

**Example mapping:**
```python
TOOL_PERSISTENCE_POLICY = {
    "list_objects":   "ephemeral",
    "reason":         "ephemeral",
    "specify":        "ephemeral",
    "read_object":    "session",
    "plan":           "session",
    "create_file":    "short_term",
    "update_profile": "short_term",
}
```

---

## 6. Stream Policy

Controls which part of the tool call gets streamed to the client:

| Policy | What streams | Use case |
|--------|-------------|----------|
| `output` | Tool result only | Standard reads and searches |
| `args` | Tool arguments as they're constructed | Confirmation flows — user sees what will be sent |
| `both` | Args + output | Canvas tools, async workflows |
| `none` | Nothing | Memory tools, internal helpers |

---

## 7. Risk Levels

Assign risk level to tools for observability and audit filtering:

| Risk | Examples | Logging behavior |
|------|---------|------------------|
| `low` | read_object, search, list | Standard trace |
| `medium` | canvas generation, workflow triggers | Full audit log |
| `high` | Delete operations, auth changes, financial | Full audit + alert |

---

## 8. Context Accumulation

For tools that build progressive state across a multi-turn session, enable context accumulation:

```python
ToolSpec(
    name="research_gather",
    category=ToolCategory.SEARCH_OBJECTS,
    context_accumulation={
        "enabled": True,
        "key": "research_evidence",   # stored under this key in run_memory
    }
)
```

Accumulated context is available in subsequent turns without re-fetching.

---

## 9. Multi-Tool Disambiguation Guide

When designing a set of tools, define non-overlapping triggers:

```
User intent: "Find the candidate named Alice"
├── Known ID? → read_object(type="candidate", id=...)
└── Name search? → search_objects(query="Alice", object_type="candidate")

User intent: "Update her salary"
├── Confirm first? YES → update_confirmation (always_ask)
└── Auto-trusted operation? → update_confirmation (always_auto)
```

Embed this disambiguation directly in the "Do NOT use for" field of affected tools.

---

## 10. Tool Audit Checklist

Before shipping a new tool:

- [ ] Name is a verb-noun or action phrase (not `data`, `stuff`, `helper`)
- [ ] One-line description starts with a verb
- [ ] "Use when" is condition-based, not action-based
- [ ] "Do NOT use for" disambiguates from the top 1-2 wrong tools
- [ ] Side effects explicitly stated ("read-only" or mutation described)
- [ ] All parameters have type + format + valid values documented
- [ ] Confirmation policy assigned and matches risk level
- [ ] Persistence policy assigned
- [ ] Stream policy assigned
- [ ] Category set to the most restrictive that applies
- [ ] Intern Test passed (read the description cold — would you misuse it?)

---

## 11. Element Behavior

Each ToolCategory controls what UI element/component is rendered for the tool call:

| Category | Element behavior |
|----------|-----------------|
| `ai_as_a_tool` | `element: "ai_run"` (generalized) |
| `agent_as_a_tool` | `element: "agent_run"` (generalized) |
| `read_objects` | No element (data-only message) |
| `list_objects` | No element (data-only message) |
| `memory_tools` | No element (data-only message) |
| `search_objects` | Tool name as element |
| `create_confirmation` | Tool name as element |
| `update_confirmation` | `element: "update"` (generalized) |
| `schedule_confirmation` | Tool name as element |
| `workflow_confirmation` | Tool name as element |
| `auth_confirmation` | Tool name as element |
| `resource_tools` | Generalized element names |
| `hosted_mcp_tool` | Generalized element names |

---

## 12. Memory Policy

Beyond persistence tier (ephemeral/session/short_term), each tool can specify a memory policy controlling what gets written to agent memory:

| Field | Values | Description |
|-------|--------|-------------|
| `save` | `"output"`, `"args"`, `"both"`, `"none"` | What part of the tool call to save to memory |
| `scope` | `"user"`, `"company"`, `"both"` | Memory scope for saved content |
| `lifecycle` | `"short"`, `"long"` | How long to retain (affects retrieval priority) |

```python
ToolSpec(
    name="update_profile",
    category=ToolCategory.UPDATE_CONFIRMATION,
    memory_policy={
        "save": "both",       # save both args and output
        "scope": "user",      # scoped to this user
        "lifecycle": "long",  # retained for retrieval across sessions
    }
)
```

**Memory policy defaults:**
- `read_objects`, `list_objects`, `search_objects`: `save = "none"` (read-only, no retention)
- `update_confirmation`, `create_confirmation`: `save = "both"` (record what changed and the result)
- `helper_tools`: `save = "none"` (ephemeral utilities)
- `memory_tools`: `save = "output"` (the memory write itself is the artifact)

---

## 13. Debugging Tool Selection Failures

When an agent calls the wrong tool:

1. **Check description ambiguity** — does the wrong tool's description plausibly match the user intent?
2. **Check ordering** — tools listed earlier in the config receive more attention; move high-priority tools up
3. **Check "Do NOT use for" clauses** — add explicit disambiguation
4. **Check tool name** — rename if the name implies the wrong action
5. **Add a few-shot example** in the system prompt showing correct tool selection for this intent
6. **Add an eval case** for this failure pattern (see [evals-system.md](../../ai-evals-observability/references/evals-system.md))
