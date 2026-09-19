# Agentic System Design

Agent architectures, tool use patterns, and multi-agent orchestration with pseudocode.

## Architectures Index

1. [ReAct Pattern](#1-react-pattern)
2. [Plan-and-Execute](#2-plan-and-execute)
3. [Tool Use / Function Calling](#3-tool-use--function-calling)
4. [Multi-Agent Collaboration](#4-multi-agent-collaboration)
5. [Memory and State Management](#5-memory-and-state-management)
6. [Agent Design Patterns](#6-agent-design-patterns)
7. [Multi-Agent Coordination Protocols](#7-multi-agent-coordination-protocols)
8. [Orchestration Patterns](#8-orchestration-patterns)
9. [Agent Lifecycle & Guardrails](#9-agent-lifecycle--guardrails)

---

## 1. ReAct Pattern

**Reasoning + Acting**: The agent alternates between thinking about what to do and taking actions.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ReAct Loop                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│   │ Thought │───▶│ Action  │───▶│  Tool   │───▶│Observat.│ │
│   └─────────┘    └─────────┘    └─────────┘    └────┬────┘ │
│        ▲                                            │       │
│        └────────────────────────────────────────────┘       │
│                         (loop until done)                   │
└─────────────────────────────────────────────────────────────┘
```

### Pseudocode

```python
def react_agent(query, tools, max_iterations=10):
    """
    ReAct agent implementation.

    Args:
        query: User question
        tools: Dict of available tools {name: function}
        max_iterations: Safety limit
    """
    context = f"Question: {query}\n"

    for i in range(max_iterations):
        # Generate thought and action
        response = llm.generate(
            REACT_PROMPT.format(
                tools=format_tools(tools),
                context=context
            )
        )

        # Parse response
        thought = extract_thought(response)
        action = extract_action(response)

        context += f"Thought: {thought}\n"

        # Check for final answer
        if action.name == "finish":
            return action.argument

        # Execute tool
        if action.name in tools:
            observation = tools[action.name](action.argument)
            context += f"Action: {action.name}({action.argument})\n"
            context += f"Observation: {observation}\n"
        else:
            context += f"Error: Unknown tool {action.name}\n"

    return "Max iterations reached"
```

### Prompt Template

```
You are a helpful assistant that can use tools to answer questions.

Available tools:
{tools}

Answer format:
Thought: [your reasoning about what to do next]
Action: [tool_name(argument)] OR finish(final_answer)

{context}

Continue:
```

### When to Use

| Scenario | ReAct Fit |
|----------|-----------|
| Simple Q&A with lookup | Good |
| Multi-step research | Good |
| Math calculations | Good |
| Creative writing | Poor |
| Real-time conversation | Poor |

---

## 2. Plan-and-Execute

**Two-phase approach**: First create a plan, then execute each step.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Plan-and-Execute                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Planning                                           │
│  ┌──────────┐    ┌──────────────────────────────────────┐   │
│  │  Query   │───▶│  Generate step-by-step plan          │   │
│  └──────────┘    └──────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│                  ┌──────────────────────┐                    │
│                  │ Plan: [S1, S2, S3]   │                    │
│                  └──────────┬───────────┘                    │
│                             │                                │
│  Phase 2: Execution         │                                │
│                  ┌──────────▼───────────┐                    │
│                  │   Execute Step 1     │                    │
│                  └──────────┬───────────┘                    │
│                             │                                │
│                  ┌──────────▼───────────┐                    │
│                  │   Execute Step 2     │──▶ Replan?         │
│                  └──────────┬───────────┘                    │
│                             │                                │
│                  ┌──────────▼───────────┐                    │
│                  │   Execute Step 3     │                    │
│                  └──────────┬───────────┘                    │
│                             │                                │
│                  ┌──────────▼───────────┐                    │
│                  │    Final Answer      │                    │
│                  └──────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

### Pseudocode

```python
def plan_and_execute(query, tools):
    """
    Plan-and-Execute agent.

    Separates planning from execution for complex tasks.
    """
    # Phase 1: Generate plan
    plan = generate_plan(query)

    results = []

    # Phase 2: Execute each step
    for i, step in enumerate(plan.steps):
        # Execute step
        result = execute_step(step, tools, results)
        results.append(result)

        # Optional: Check if replanning needed
        if should_replan(step, result, plan):
            remaining_steps = plan.steps[i+1:]
            new_plan = replan(query, results, remaining_steps)
            plan.steps = plan.steps[:i+1] + new_plan.steps

    # Synthesize final answer
    return synthesize_answer(query, results)


def generate_plan(query):
    """Generate execution plan from query."""
    prompt = f"""
    Create a step-by-step plan to answer this question:
    {query}

    Format each step as:
    Step N: [action description]

    Keep the plan concise (3-7 steps).
    """
    response = llm.generate(prompt)
    return parse_plan(response)


def execute_step(step, tools, previous_results):
    """Execute a single step using available tools."""
    prompt = f"""
    Execute this step: {step.description}

    Previous results:
    {format_results(previous_results)}

    Available tools: {format_tools(tools)}

    Provide the result of this step.
    """
    return llm.generate(prompt)
```

### When to Use

| Task Complexity | Recommendation |
|-----------------|----------------|
| Simple (1-2 steps) | Use ReAct |
| Medium (3-5 steps) | Plan-and-Execute |
| Complex (6+ steps) | Plan-and-Execute with replanning |
| Highly dynamic | ReAct with adaptive planning |

---

## 3. Tool Use / Function Calling

**Structured tool invocation**: LLM generates structured calls that are executed externally.

### Tool Definition Schema

```json
{
  "name": "search_web",
  "description": "Search the web for current information",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      },
      "num_results": {
        "type": "integer",
        "default": 5,
        "description": "Number of results to return"
      }
    },
    "required": ["query"]
  }
}
```

### Implementation Pattern

```python
class ToolRegistry:
    """Registry for agent tools."""

    def __init__(self):
        self.tools = {}

    def register(self, name, func, schema):
        """Register a tool with its schema."""
        self.tools[name] = {
            "function": func,
            "schema": schema
        }

    def get_schemas(self):
        """Get all tool schemas for LLM."""
        return [t["schema"] for t in self.tools.values()]

    def execute(self, name, arguments):
        """Execute a tool by name."""
        if name not in self.tools:
            raise ValueError(f"Unknown tool: {name}")

        func = self.tools[name]["function"]
        return func(**arguments)


def tool_use_agent(query, registry):
    """Agent with function calling."""
    messages = [{"role": "user", "content": query}]

    while True:
        # Call LLM with tools
        response = llm.chat(
            messages=messages,
            tools=registry.get_schemas(),
            tool_choice="auto"
        )

        # Check if done
        if response.finish_reason == "stop":
            return response.content

        # Execute tool calls
        if response.tool_calls:
            for call in response.tool_calls:
                result = registry.execute(
                    call.function.name,
                    json.loads(call.function.arguments)
                )
                messages.append({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": str(result)
                })
```

### Tool Design Best Practices

| Practice | Example |
|----------|---------|
| Clear descriptions | "Search web for query" not "search" |
| Type hints | Use JSON Schema types |
| Default values | Provide sensible defaults |
| Error handling | Return error messages, not exceptions |
| Idempotency | Same input = same output |

---

## 4. Multi-Agent Collaboration

### Orchestration Patterns

**Pattern 1: Sequential Pipeline**
```
Agent A → Agent B → Agent C → Output

Use case: Research → Analysis → Writing
```

**Pattern 2: Hierarchical**
```
        ┌─────────────┐
        │ Coordinator │
        └──────┬──────┘
    ┌──────────┼──────────┐
    ▼          ▼          ▼
┌───────┐ ┌───────┐ ┌───────┐
│Agent A│ │Agent B│ │Agent C│
└───────┘ └───────┘ └───────┘

Use case: Complex task decomposition
```

**Pattern 3: Debate/Consensus**
```
┌───────┐     ┌───────┐
│Agent A│◄───▶│Agent B│
└───┬───┘     └───┬───┘
    │             │
    └──────┬──────┘
           ▼
    ┌─────────────┐
    │   Arbiter   │
    └─────────────┘

Use case: Critical decisions, fact-checking
```

### Pseudocode: Hierarchical Multi-Agent

```python
class CoordinatorAgent:
    """Coordinates multiple specialized agents."""

    def __init__(self, agents):
        self.agents = agents  # Dict[str, Agent]

    def process(self, query):
        # Decompose task
        subtasks = self.decompose(query)

        # Assign to agents
        results = {}
        for subtask in subtasks:
            agent_name = self.select_agent(subtask)
            result = self.agents[agent_name].execute(subtask)
            results[subtask.id] = result

        # Synthesize
        return self.synthesize(query, results)

    def decompose(self, query):
        """Break query into subtasks."""
        prompt = f"""
        Break this task into subtasks for specialized agents:

        Task: {query}

        Available agents:
        - researcher: Gathers information
        - analyst: Analyzes data
        - writer: Produces content

        Format:
        1. [agent]: [subtask description]
        """
        response = llm.generate(prompt)
        return parse_subtasks(response)

    def select_agent(self, subtask):
        """Select best agent for subtask."""
        return subtask.assigned_agent

    def synthesize(self, query, results):
        """Combine agent results into final answer."""
        prompt = f"""
        Combine these results to answer: {query}

        Results:
        {format_results(results)}

        Provide a coherent final answer.
        """
        return llm.generate(prompt)
```

### Communication Protocols

| Protocol | Description | Use When |
|----------|-------------|----------|
| Direct | Agent calls agent | Simple pipelines |
| Message queue | Async message passing | High throughput |
| Shared state | Shared memory/database | Collaborative editing |
| Broadcast | One-to-many | Status updates |

---

## 5. Memory and State Management

### Memory Types

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Memory System                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ Working Memory  │  │  Episodic Memory │                  │
│  │ (Current task)  │  │ (Past sessions)  │                  │
│  └────────┬────────┘  └────────┬─────────┘                  │
│           │                    │                            │
│           └────────┬───────────┘                            │
│                    ▼                                        │
│  ┌─────────────────────────────────────────┐               │
│  │           Semantic Memory               │               │
│  │    (Long-term knowledge, embeddings)    │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```python
class AgentMemory:
    """Memory system for conversational agents."""

    def __init__(self, embedding_model, vector_store):
        self.embedding_model = embedding_model
        self.vector_store = vector_store
        self.working_memory = []  # Current conversation
        self.buffer_size = 10     # Recent messages to keep

    def add_message(self, role, content):
        """Add message to working memory."""
        self.working_memory.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now()
        })

        # Trim if too long
        if len(self.working_memory) > self.buffer_size:
            # Summarize old messages before removing
            old_messages = self.working_memory[:5]
            summary = self.summarize(old_messages)
            self.store_long_term(summary)
            self.working_memory = self.working_memory[5:]

    def store_long_term(self, content):
        """Store in semantic memory (vector store)."""
        embedding = self.embedding_model.embed(content)
        self.vector_store.add(
            embedding=embedding,
            metadata={"content": content, "type": "summary"}
        )

    def retrieve_relevant(self, query, k=5):
        """Retrieve relevant memories for context."""
        query_embedding = self.embedding_model.embed(query)
        results = self.vector_store.search(query_embedding, k=k)
        return [r.metadata["content"] for r in results]

    def get_context(self, query):
        """Build context for LLM from memories."""
        relevant = self.retrieve_relevant(query)
        recent = self.working_memory[-self.buffer_size:]

        return {
            "relevant_memories": relevant,
            "recent_conversation": recent
        }

    def summarize(self, messages):
        """Summarize messages for long-term storage."""
        content = "\n".join([
            f"{m['role']}: {m['content']}"
            for m in messages
        ])
        prompt = f"Summarize this conversation:\n{content}"
        return llm.generate(prompt)
```

### State Persistence Patterns

| Pattern | Storage | Use Case |
|---------|---------|----------|
| In-memory | Dict/List | Single session |
| Redis | Key-value | Multi-session, fast |
| PostgreSQL | Relational | Complex queries |
| Vector DB | Embeddings | Semantic search |

---

## 6. Agent Design Patterns

### Pattern: Reflection

Agent reviews and critiques its own output.

```python
def reflective_agent(query, tools):
    """Agent that reflects on its answers."""
    # Initial response
    response = react_agent(query, tools)

    # Reflection
    critique = llm.generate(f"""
    Review this answer for:
    1. Accuracy - Is the information correct?
    2. Completeness - Does it fully answer the question?
    3. Clarity - Is it easy to understand?

    Question: {query}
    Answer: {response}

    Critique:
    """)

    # Check if revision needed
    if needs_revision(critique):
        revised = llm.generate(f"""
        Improve this answer based on the critique:

        Original: {response}
        Critique: {critique}

        Improved answer:
        """)
        return revised

    return response
```

### Pattern: Self-Ask

Break complex questions into simpler sub-questions.

```python
def self_ask_agent(query, tools):
    """Agent that asks itself follow-up questions."""
    context = []

    while True:
        prompt = f"""
        Question: {query}

        Previous Q&A:
        {format_qa(context)}

        Do you need to ask a follow-up question to answer this?
        If yes: "Follow-up: [question]"
        If no: "Final Answer: [answer]"
        """

        response = llm.generate(prompt)

        if response.startswith("Final Answer:"):
            return response.replace("Final Answer:", "").strip()

        # Answer follow-up question
        follow_up = response.replace("Follow-up:", "").strip()
        answer = simple_qa(follow_up, tools)
        context.append({"q": follow_up, "a": answer})
```

### Pattern: Expert Routing

Route queries to specialized sub-agents.

```python
class ExpertRouter:
    """Routes queries to expert agents."""

    def __init__(self):
        self.experts = {
            "code": CodeAgent(),
            "math": MathAgent(),
            "research": ResearchAgent(),
            "general": GeneralAgent()
        }

    def route(self, query):
        """Determine best expert for query."""
        prompt = f"""
        Classify this query into one category:
        - code: Programming questions
        - math: Mathematical calculations
        - research: Fact-finding, current events
        - general: Everything else

        Query: {query}
        Category:
        """
        category = llm.generate(prompt).strip().lower()
        return self.experts.get(category, self.experts["general"])

    def process(self, query):
        expert = self.route(query)
        return expert.execute(query)
```

---

## Quick Reference: Pattern Selection

| Need | Pattern |
|------|---------|
| Simple tool use | ReAct |
| Complex multi-step | Plan-and-Execute |
| API integration | Function Calling |
| Multiple perspectives | Multi-Agent Debate |
| Quality assurance | Reflection |
| Complex reasoning | Self-Ask |
| Domain expertise | Expert Routing |
| Conversation continuity | Memory System |
| Cross-vendor agent collaboration | A2A Protocol |
| Central orchestration | Manager Pattern |
| Distributed peer tasks | Handoff Pattern |

---

## 7. Multi-Agent Coordination Protocols

### MCP vs A2A vs ACP

| Protocol | Layer | Purpose |
|----------|-------|---------|
| **MCP** | Tool/resource | Agents reach external systems (tools, data, resources) |
| **A2A** | Agent-to-agent | Agents collaborate across vendors/frameworks |
| **ACP** | Agent control plane | Internal orchestration, lifecycle control, streaming |

**Decision rule:**
- All collaboration is internal → use orchestration (ACP/SDK)
- Need cross-vendor or external agent collaboration → add A2A
- Need tool/data access → use MCP

### A2A Protocol (Agent-to-Agent)

A2A enables agent interoperability across frameworks and vendors. An agent exposing A2A publishes an **agent card** that describes its capabilities.

**Agent card structure:**
```json
{
  "name": "hr-screener",
  "description": "Screens candidates against job requirements",
  "endpoint": "https://api.example.com/agents/hr-screener",
  "capabilities": ["candidate_evaluation", "job_matching"],
  "auth": {"type": "bearer"},
  "streaming": true
}
```

**A2A task lifecycle:**
```
CREATED → ACCEPTED → IN_PROGRESS → [STREAMING] → COMPLETED
                                               → FAILED
                                               → CANCELLED
```

**A2A complements MCP**: MCP connects agents to tools; A2A connects agents to agents. Implement A2A when external partners or third-party agents need to invoke your agents by capability rather than by URL.

### Coordination Services (Lease / Anchor / Conflict)

For multi-agent systems operating on shared state:

| Service | Purpose |
|---------|---------|
| `lease_service` | Distributed lock for exclusive operations (prevents concurrent writes) |
| `anchor_service` | Ensures consistent reference across parallel agent branches |
| `conflict_service` | Detects and resolves write conflicts when agents operate in parallel |

---

## 8. Orchestration Patterns

### Pattern A: Manager-as-Tools (Central Orchestrator)

A single orchestrator agent holds all routing logic. Peer agents are exposed as tools.

```
User → Orchestrator
         ├── call agent_as_a_tool("research_agent", task)
         ├── call agent_as_a_tool("writing_agent", task)
         └── synthesize results → User
```

**When to use:**
- All agents are internal (same framework)
- Orchestrator needs to maintain full context across agent calls
- Simple linear or branching workflows

**Tradeoff:** Single point of failure; orchestrator context grows with each agent call.

### Pattern B: Handoff (Peer-to-Peer Transfer)

An agent transfers full control to a peer. The original agent exits the loop.

```
User → Agent A
         └── handoff(target="agent_b", context=forwarded_context)
              → Agent B continues
                   └── final response → User
```

**When to use:**
- Clear domain boundary (agent A handles intent detection, agent B handles execution)
- Context forwarding is complete and unambiguous
- You want lower orchestrator context pressure

**Instruction Forwarding**: extract only the domain rules and constraints relevant to the sub-task before handing off. Never forward the full system prompt.

### Pattern C: Parallel Fan-Out + Merge

Run N agents simultaneously; merge results before final generation.

```python
results = await asyncio.gather(
    agent_a.run(task_slice_a),
    agent_b.run(task_slice_b),
    agent_c.run(task_slice_c),
)
merged = merge_strategy(results)   # majority vote, union, or LLM-merge
```

**When to use:**
- Tasks can be partitioned without dependencies
- Time budget is tight (parallelism reduces wall-clock time)
- You want diversity of perspectives before synthesis

### Pattern D: Hierarchical (Manager → Sub-managers → Workers)

```
Orchestrator
  ├── Research Manager
  │     ├── Source Agent A
  │     └── Source Agent B
  └── Writing Manager
        ├── Draft Agent
        └── Review Agent
```

**Context Forward-Propagation rule**: at each level, compress and extract conclusions before forwarding to the next level. Never pass raw intermediate traces across levels.

---

## 9. Agent Lifecycle & Guardrails

### Complete Request Lifecycle

```
POST /api/agent/ → AgentView
    → WebSocket status: starting
    → Celery: run_agent_task (async)
    → 202 {task_id, ws_group}

Celery:
    → Orchestrator: execute_workflow
        → Load credentials
        → Load previous context (thread history)
        → Determine primary agent (routing)
        → Route to agent

    → AgentService: process_agent_streamed
        → Load session (thread_id → SQLiteSession)
        → SDK Runner.run_streamed
            → streaming: token deltas, reasoning, tool events → WebSocket
        → Final result → ResultBus

    → ResultBus:
        → extract_context_from_result
        → persist_to_conversation (DB)
        → WebSocket status: success
```

### Guardrail Types

| Type | Trigger | Behavior |
|------|---------|----------|
| `InputGuardrail` | Before agent processes input | Reject, sanitize, or flag |
| `OutputGuardrail` | After agent generates output | Block, redact, or escalate |
| Session guardrail | Per-session state | Rate limiting, turn limits |
| Confirmation gate | Tool call | Pause execution for user approval |

### Max Turns & Safety Limits

Every agent run must have an explicit `max_turns` limit. When `MaxTurnsExceeded` is raised:
1. Return the best partial result accumulated so far
2. Surface the turn count in the response metadata
3. Log the trace for debugging
4. Never silently truncate

### Streaming Control

| Event type | Streamed to client |
|------------|-------------------|
| Token deltas | Yes (real-time) |
| Reasoning chunks | Yes (if reasoning model) |
| Tool call args | Conditional (see tool stream_policy) |
| Tool call results | Conditional (see tool stream_policy) |
| Status events | Yes (starting, success, error) |

### Autonomy Levels

| Level | Description | Confirmation required |
|-------|-------------|----------------------|
| Supervised | Every action confirmed | Yes (all writes) |
| Semi-autonomous | Only high-risk confirmed | Yes (medium/high risk) |
| Autonomous | Operator pre-approved scope | No (within approved tools) |
| Full autonomous | Complete delegation | No |

**Default**: start at semi-autonomous for new agents. Move toward autonomous only after eval coverage is established.

---

## 10. Run Steering

`RunSteeringService` injects concise guidance into active agent runs without interrupting them — mid-run correction without requiring a new user message.

### When steering fires

Two trigger conditions:
1. **Pending steers**: the user queued a steer while the agent was mid-run (via `push_pending_steers(thread_id, steer)`). Fires on the next tool output.
2. **Actionable output**: the tool output contains error/warning markers and `AGENT_STEERING_SCORE_TOOL_OUTPUTS = true`. Throttled to one check per `AGENT_STEERING_MIN_INTERVAL_SECONDS` (default: 30s).

```python
# Actionable output markers (triggers proactive scoring)
"error", "failed", "warning", "needs_confirmation", "not_found", "validation"
```

### Steering pipeline

```
Tool call completes
    ↓
evaluate_tool_output(thread_id, run_id, tool_name, tool_args, tool_output)
    ↓
Check pending_steers + _looks_actionable(output_text)
    ↓
_build_evaluation → LLM generates SteeringEvaluation(score, steers)
    ↓
steers[:3] → route_memory_write(subtype="runtime_steer")
    ↓
clear_pending_steers(thread_id)
```

### SteeringEvaluation schema

```python
class SteeringEvaluation(BaseModel):
    score: float   # 0.0–1.0: how much correction is needed
    steers: list[str]  # 0–3 actionable steering sentences
```

### Steer write contract

Steers are written via `route_memory_write` with:
```python
{
    "memory_type": "steers",
    "subtype": "runtime_steer",
    "scope": "company" if company_id else "user",
    "metadata": {
        "tool_name": tool_name,
        "run_id": run_id,
        "score": evaluation.score,
        "pending_steers": pending_steers,
        "source_type": "run_steering",
    }
}
```

### Design rules

- Max 3 steers injected per tool output. Truncate, never expand.
- Steers must be directly actionable ("Search for candidates with Python, not JavaScript") not diagnostic ("the previous search was wrong").
- `reasoning_effort = "low"` — steering is a real-time path; latency matters more than depth.
- If `_build_evaluation` fails, fall back to the raw pending steer text rather than dropping it.

---

## 11. Agent Skill Package Schema

Agent skills are packaged and deployed using `AgentSkillPackageSpec`. This enables distributable, versioned skill bundles that can be hosted, inlined, or loaded from local paths.

### AgentSkillFileSpec

```python
class AgentSkillFileSpec(BaseModel):
    path: str           # relative path (e.g. "SKILL.md", "scripts/process.py")
    content: str        # file contents
    encoding: Literal["utf-8", "base64"] = "utf-8"  # base64 for binary
    mime_type: str | None = None     # optional: "text/markdown", "text/x-python"
    description: str | None = None  # what this file does in the skill
```

### AgentSkillPackageSpec

```python
class AgentSkillPackageSpec(BaseModel):
    name: str           # 1-64 chars, lowercase alphanumeric + hyphens
    title: str          # human-friendly display title
    description: str    # trigger keywords + what this does (1-1024 chars)
    files: list[AgentSkillFileSpec]  # all files including SKILL.md
    entrypoint: str | None = None    # e.g. "scripts/main.py"
    directories: list[str] = []      # e.g. ["scripts", "references", "assets"]
```

### Runtime deployment variants

| Variant | Schema | Use case |
|---------|--------|----------|
| `hosted_reference` | `HostedSkillReferenceSpec(skill_id, version)` | Published skill registry |
| `hosted_inline` | `HostedInlineSkillSpec(zip_base64)` | Inline zip bundle |
| `local_path` | `LocalSkillPathSpec(path)` | Development and CI |

All three extend `AgentSkillRuntimeSpecBase`:
```python
class AgentSkillRuntimeSpecBase(BaseModel):
    category_id: str
    name: str
    title: str
    description: str
    scope: Literal["platform", "company", "user"] = "company"
    source_type: str = ""
    source_kind: str = ""
    prompt_path: str | None = None
```

### Scope semantics

| Scope | Availability |
|-------|-------------|
| `platform` | All companies and users |
| `company` | This company only (default) |
| `user` | This user only |

### Minimum required files

Every skill package must include `SKILL.md` (the routing entry point) at the root. All other files (scripts, references, templates) are optional but must be referenced from `SKILL.md` to be loaded.

```python
AgentSkillPackageSpec(
    name="hr-research",
    title="HR Research Skill",
    description="Find and summarize candidate and job data. Use when searching HR records.",
    files=[
        AgentSkillFileSpec(path="SKILL.md", content="..."),
        AgentSkillFileSpec(path="references/search-guide.md", content="..."),
        AgentSkillFileSpec(path="scripts/search.py", content="..."),
    ],
    directories=["references", "scripts"],
)
