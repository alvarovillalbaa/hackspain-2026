# Agent Topology Decision Record

Template for documenting architecture decisions when choosing or changing the topology of an agent system.

**Use when:** introducing a new multi-agent architecture, changing coordination pattern, or evaluating topology options for a new task class.

**Do not use for:** single-tool or single-agent design (no decision record needed) or generic orchestration reference (see `agentic-system-design.md`).

**Related child skills:** `agent-system-architecture`, `ai-governance-safety`, `ai-evals-observability`

---

Copy this template and fill in each section. Archive completed records in `agent-system-architecture/references/topology-decisions/`.

---

```markdown
# Agent Topology Decision Record: <system-name>

**Date:** YYYY-MM-DD
**Author:** <name>
**Status:** draft | accepted | superseded

---

## Task Class

What work does this architecture support?

<Describe the category of tasks: document processing, research synthesis, workflow automation, etc.
Include scale expectations: requests/day, average task duration, parallelism requirements.>

---

## Architecture Choice

Select one:

- [ ] Single agent (one model, one tool set, sequential)
- [ ] Pipeline (agents in fixed sequence, output of one → input of next)
- [ ] Manager-as-tools (central manager invokes specialized agents as tools)
- [ ] Handoff (agents transfer control; one agent active at a time)
- [ ] Parallel fan-out + merge (manager spawns N agents, collects results)
- [ ] Recursive sub-agent tree (agents spawn sub-agents dynamically)
- [ ] Blackboard / committee (agents share a common workspace; no strict order)

---

## Why This Topology

Answer each dimension:

**Decision uncertainty:**
<How predictable is the sequence of steps? High uncertainty favors plan-execute or blackboard over pipeline.>

**State sharing:**
<Do agents need to read/write shared state? High sharing favors blackboard or manager-as-tools over handoffs.>

**Latency budget:**
<Is total latency bounded? Sequential topologies are slower; parallel fan-out reduces wall time.>

**Safety / HITL requirement:**
<Is human approval required? If yes, where in the topology does confirmation occur? See hitl-and-approval-preferences.md.>

**Tool scope:**
<Do agents need different tool sets? If yes, specialized agents (manager-as-tools or handoffs) are preferred over a single broad-tool agent.>

**Context isolation requirement:**
<Must agents not share context (e.g., privacy, PII scoping)? Parallel fan-out with no shared context is safest.>

---

## Agent Inventory

| Agent | Purpose | Inputs | Outputs | Tools | MCP allowlist | Autonomy level |
|---|---|---|---|---|---|---|
| <name> | <role> | <input types> | <output types> | <tool names> | <allowed MCP namespaces> | auto / confirm / manual |

---

## Topology Diagram

```
<ASCII or text-based diagram showing agent relationships, data flow, and handoff/tool-call boundaries.>

Example:
  user request
       │
       ▼
  manager_agent
  ├── research_agent (as tool)
  │     └── web_search, doc_reader
  ├── synthesis_agent (as tool)
  │     └── reason, plan
  └── writer_agent (as tool)
        └── create_document
```

---

## Failure Modes

| Failure | Symptom | Mitigation |
|---|---|---|
| Wrong routing | Manager sends task to wrong specialist | Add Intern Test on manager's tool descriptions; add routing eval |
| Context leakage | Agent receives data from another user's session | Enforce context isolation at agent spawn; scope tool access |
| Tool conflict | Two agents attempt conflicting writes simultaneously | Use optimistic locking or serialize writes through manager |
| HITL block | Agent-as-tool pauses for confirmation; parent run stalls | Bubble child HITL events to parent stream (see hitl-and-approval-preferences.md) |
| Merge conflict | Parallel agents return contradictory results | Define merge strategy before fan-out; use judge pattern to resolve |
| Runaway recursion | Recursive agent spawns indefinitely | Set max_depth and max_agents_per_run limits |

---

## Required Evals

List the eval slugs that must pass before this topology ships to production:

- `routing_accuracy_<manager_agent>` — manager selects correct specialist for each task class
- `context_isolation_<agent_pair>` — no cross-user data in agent context
- `hitl_propagation` — child confirmation events reach parent stream
- `merge_conflict_resolution` — parallel outputs merged correctly
- `latency_<task_class>` — end-to-end latency within SLO for expected task distribution

---

## Alternatives Considered

| Topology | Why rejected |
|---|---|
| <alternative> | <reason> |

---

## Links

- System prompt(s): <path or link>
- Eval runs: <link to eval dashboard>
- Related ADRs: <links>
- Notion design doc: <link>
```
