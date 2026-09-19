# Agent-Native Architecture

Agent-native applications treat agents as first-class citizens. Features are outcomes achieved by an agent with tools operating in a loop, not functions written in code.

## Five Core Principles

| Principle | What it means |
|-----------|---------------|
| **Parity** | Whatever the user can do through the UI, the agent can achieve through tools. No orphan UI actions. |
| **Granularity** | Tools are atomic primitives; features are prompt-defined outcomes. To change behavior, edit prose, not code. |
| **Composability** | New features = new prompts, not new code. Atomic tools + parity make this possible. |
| **Emergent Capability** | The agent accomplishes things you didn't explicitly design for. Open-ended requests reveal latent demand. |
| **Improvement Over Time** | Apps get better through accumulated context (e.g. a `context.md` file) and prompt refinement, without shipping code. |

## Architecture Checklist

Verify these **before implementation** when designing an agent-native system.

### Core Principles
- [ ] **Parity:** Every UI action has a corresponding agent capability
- [ ] **Granularity:** Tools are primitives; features are prompt-defined outcomes
- [ ] **Composability:** New features can be added via prompts alone
- [ ] **Emergent Capability:** Agent can handle open-ended requests in your domain

### Tool Design
- [ ] **Dynamic vs Static:** For external APIs with full access, prefer dynamic capability discovery over one-tool-per-endpoint
- [ ] **CRUD Completeness:** Every entity has create, read, update, AND delete
- [ ] **Primitives not Workflows:** Tools enable capability, don't encode business logic
- [ ] **Loose input typing:** Use `z.string()` when the API validates; reserve `z.enum()` for genuinely constrained values

### Files & Workspace
- [ ] **Shared Workspace:** Agent and user work in the same data space
- [ ] **context.md Pattern:** Agent reads/updates a context file for accumulated knowledge
- [ ] **File Organization:** Entity-scoped directories with consistent naming

### Agent Execution
- [ ] **Completion Signals:** Agent has an explicit `complete_task` tool (not heuristic detection)
- [ ] **Partial Completion:** Multi-step tasks track progress for resume
- [ ] **Context Limits:** Designed for bounded context from the start

### Context Injection
- [ ] **Available Resources:** System prompt includes what exists (files, data, types)
- [ ] **Available Capabilities:** System prompt documents tools with user vocabulary
- [ ] **Dynamic Context:** Context refreshes for long sessions (or provide a `refresh_context` tool)

### UI Integration
- [ ] **Agent → UI:** Agent changes reflect in UI (shared service, file watching, or event bus)
- [ ] **No Silent Actions:** Agent writes trigger UI updates immediately
- [ ] **Capability Discovery:** Users can learn what the agent can do

## Architecture Patterns

### Event-Driven Agent

```
Event Source → Agent (Claude) → Tool Calls → Response
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Content Tools  Self Tools   Data Tools
   (write_file)  (read_source) (store_item)
```

Events (messages, webhooks, timers) trigger agent turns. Agent decides how to respond based on system prompt. Tools are primitives for IO, not business logic. State persists via data tools.

### Two-Layer Git (Self-Modifying Agents)

Separate code (shared, tracked in git) from data (instance-specific, gitignored):

```
GitHub (shared): src/, site/, package.json
Instance only:   data/, logs/, .env
```

Why it works: code is version-controlled; raw data stays local; site is generated from data (reproducible); rollback via git history.

### Shared Workspace

Agent and user work on the same files. Anti-pattern: `user_files/` + `agent_output/` as separate directories. Correct pattern: both read/write the same `documents/` or `data/` directory.

### Dynamic Capability Discovery

For external APIs, prefer:
```typescript
tool("list_available_types", ...)     // discover what's there
tool("read_health_data", { dataType: z.string() }, ...) // access it
```

Over 50 hardcoded endpoint tools. The agent learns the API at runtime; new endpoints are automatically accessible.

## Anti-Patterns

### The Cardinal Sin

```typescript
// WRONG — you wrote the workflow, agent just executes it
tool("process_feedback", async ({ message }) => {
  const category = categorize(message);    // your code decides
  const priority = calcPriority(message);  // your code decides
  await store(message, category, priority);
  if (priority > 3) await notify();        // your code decides
});

// RIGHT — agent figures out how to process feedback
tools: [store_item, send_message]  // primitives
prompt: "Rate importance 1-5 based on actionability, store feedback, notify if >= 4"
```

### Specific Anti-Patterns

| Anti-Pattern | Signal | Fix |
|---|---|---|
| **Agent as router** | Agent figures out intent, then calls a function | Give the agent tools and let it act, not just dispatch |
| **Request/response thinking** | Agent does one thing per turn and returns | Design for a loop: agent gets outcome to achieve, operates until done |
| **Context starvation** | Agent says "What feed? I don't understand" | Inject available resources, capabilities, and vocabulary into system prompt |
| **Orphan UI actions** | User can do X through UI, agent can't | Maintain parity — every UI action needs a tool |
| **Silent actions** | Agent changes state but UI doesn't update | Shared data stores with reactive binding or file watching |
| **Heuristic completion** | Detect completion by checking for expected output files | Require explicit `complete_task` tool call |
| **Incomplete CRUD** | Agent can create but not delete | Every entity needs full CRUD |
| **Sandbox isolation** | Agent output in `agent_output/`, user files in `user_files/` | Shared workspace — both in same directory |
| **Workflow-shaped tools** | `analyze_and_organize()` bundles judgment | Break into primitives; let agent compose |
| **Defensive over-typing** | `z.enum(["PENDING", "DONE"])` when API accepts any string | Trust the API to validate; use `z.string()` |

## Success Criteria

A system is agent-native when:

- The agent can achieve anything users can achieve through the UI (parity)
- Tools are atomic primitives; domain tools are shortcuts, not gates
- New features can be added by writing new prompts
- The agent can accomplish tasks you didn't explicitly design for (emergent capability)
- Changing behavior means editing prompts, not refactoring code
- System prompt includes dynamic context about app state
- Agent actions are immediately reflected in the UI
- Agents explicitly signal completion (no heuristic detection)

### The Ultimate Test

Describe an outcome to the agent that's within your application's domain but that you didn't build a specific feature for. Can it figure out how to accomplish it, operating in a loop until it succeeds? If yes, the system is agent-native. If it says "I don't have a feature for that," the architecture is still too constrained.

## Running an Audit

Use the `agent-native-auditor` bundled agent to score an existing codebase across all 8 principles with parallel sub-agents. Each produces a numeric score (X/Y format) and a prioritized recommendation list. See `references/agents/agent-native-auditor.md`.

## Related References

- `references/agentic-system-design.md` — broader agent architecture from scratch
- `references/harness-engineering.md` — repo readiness for coding agents (different focus: CI, evals, observability)
- `references/subagents-and-parallelism.md` — multi-agent dispatch patterns
