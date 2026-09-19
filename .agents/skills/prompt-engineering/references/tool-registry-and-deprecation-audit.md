# Tool Registry & Deprecation Audit

Lifecycle management for tools across agents: registry structure, when to add new tools, deprecation workflow, and audit checklist.

**Use when:** adding a new tool to an agent, deprecating an existing tool, auditing tool coverage across agent types, or reviewing which tools are exposed to which agents.

**Do not use for:** individual tool description design (see `tool-call-design.md`) or MCP tooling architecture (see `mcp-engineering.md`).

**Related child skills:** `prompt-engineering`, `agent-system-architecture`

**Required evals:** `tool_registry_coverage`, `deprecated_tool_not_called`, `intern_test_all_active_tools`

---

## 1. When to Create a New Tool

A new tool should be created only when there is an **uncovered use case** — a user intent or workflow step that cannot be served by any existing tool, even with a different description or parameter combination.

Before creating a new tool, ask:
1. Does an existing tool cover this use case with a better description? → update the description, not the schema
2. Is this a variant of an existing tool with different risk level? → add a `confirmation_policy` variant
3. Is this better handled by a workflow or agent-as-tool? → model the behavior as a sub-agent, not a primitive tool

**Do not create a tool for every new API endpoint.** Tool proliferation increases cognitive load on the model and degrades tool selection accuracy.

---

## 2. Registry Structure

Maintain a single registry file per agent type. Do not scatter tool definitions across multiple files.

```yaml
# tools-registry-<agent-name>.yaml
agent: <agent_name>
version: <semver>
updated_at: <ISO date>

tools:
  - name: create_task
    category: WriteAction
    status: active
    confirmation_policy: confirm_on_external
    risk_level: medium
    mcp_namespace: null
    intern_test_passed: true
    eval_slugs: [tool_selection_create_task, tool_call_format_create_task]
    added: "2024-09-01"
    notes: "Primary task creation tool; replaces add_item (deprecated)"

  - name: add_item
    category: WriteAction
    status: deprecated
    deprecated_at: "2025-01-15"
    replaced_by: create_task
    removal_target: "2025-04-15"
    notes: "Kept in registry until all callers are migrated"
```

---

## 3. Tool Status Lifecycle

```
proposed → active → deprecated → removed
    │
    └── rejected (never shipped)
```

| Status | Meaning | Agent behavior |
|---|---|---|
| `proposed` | Under design review; not shipped | Not exposed to any agent |
| `active` | Shipped and callable | Exposed to assigned agents |
| `deprecated` | Replaced by a newer tool; still callable | Exposed with deprecation notice in description |
| `removed` | Deleted from all agent configs | Not callable; registry entry archived |

**Never delete a registry entry.** Archive it with `status: removed` and the removal date. This preserves audit history.

---

## 4. Deprecation Workflow

```
1. Identify replacement tool
   └── New tool must pass Intern Test and all evals of the deprecated tool

2. Update deprecated tool description
   └── Add: "DEPRECATED: use <replacement_name> instead. Will be removed on <date>."

3. Set registry entry: status = deprecated, deprecated_at, replaced_by, removal_target

4. Notify all agent configs that include this tool
   └── Add cross-link to replacement in each agent's tool list

5. Monitor usage
   └── Alert if deprecated tool is still called after removal_target date

6. Remove from agent configs on removal_target
   └── Keep registry entry with status: removed

7. Archive registry entry
```

---

## 5. Tools-by-Agent Map

Maintain a cross-reference of which tools are exposed to which agents. This is the canonical source for:
- audit ("which agents can write to external systems?")
- scope reduction ("does this agent really need this tool?")
- incident response ("which agents were using the tool that caused the incident?")

```yaml
# tools-by-agent.yaml
tools_by_agent:
  research_agent:
    active: [web_search, read_document, reason, memory_search]
    deprecated: []

  writer_agent:
    active: [create_document, update_document, reason]
    deprecated: [add_item]

  manager_agent:
    active: [create_task, assign_task, research_agent, writer_agent]
    deprecated: []
```

---

## 6. Audit Checklist

Run this audit before any agent release or quarterly:

```markdown
## Tool Registry Audit — <agent_name> — <date>

### Coverage
- [ ] All active tools have an eval slug in `eval_slugs`
- [ ] All active tools have `intern_test_passed: true`
- [ ] No tool has been `active` for > 90 days without an eval run

### Deprecation hygiene
- [ ] All deprecated tools have a `removal_target` date
- [ ] All deprecated tools that have passed `removal_target` are removed from agent configs
- [ ] No deprecated tool description is missing the DEPRECATED notice

### Scope hygiene
- [ ] Every active tool is necessary for at least one documented use case
- [ ] No tool has `risk_level: high` without a `confirmation_policy: confirm` entry
- [ ] MCP-sourced tools are listed in the MCP allowlist (see `mcp-engineering.md`)

### Registry integrity
- [ ] No removed tool is still present in any agent config
- [ ] Registry version is updated after any addition, deprecation, or removal
```

---

## Source Notion Pages

- Everything Tool Calling (editing/improving/creating tool call names and descriptions)
- Tool Calling v0.1 (new tool calls should emerge from uncovered use cases)
- [TOOLS] Implemented and Deprecated (tool categories, tools by agent, complete tool registry)
- [REVIEW] MCP Functionality (MCP tools support tools/list and tools/call, registry-based calls)
