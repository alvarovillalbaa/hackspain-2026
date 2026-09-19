"""
Example: Manager-as-Tools multi-agent workflow.

An orchestrator agent routes between a research agent and a writing agent,
using the OpenAI Agents SDK. Shows:
  - Agent-as-tool pattern (sub-agents exposed as tools to orchestrator)
  - Instruction Forwarding (domain rules passed to sub-agents)
  - Tool filtering (each agent only sees its own tools)
  - Session manager (conversation persistence)
  - Context Forward-Propagation (conclusions passed across agents)
"""

from agents import Agent, Runner
from services.ai.agents.builder.templates import build_dynamic_instructions
from services.ai.agents.session_manager import SessionManager
from services.ai.agents.tools.spec import ToolCategory, ToolSpec

# ---------------------------------------------------------------------------
# Sub-agent: Research Agent
# ---------------------------------------------------------------------------

RESEARCH_INSTRUCTIONS = """
You are the Research Agent. You find and summarize information.

Scope:
- Search for relevant documents, candidates, and company data.
- Summarize findings concisely for the orchestrator.
- Do NOT make any updates or create any records — read only.

Tools:
### search_objects
Semantic search across HR data.
Use when: looking for candidates, jobs, or company information.
Do NOT use for: fetching by ID. Side effects: read-only.

### read_object
Fetch a single record by ID.
Use when: you have a specific ID and need full details.
Side effects: read-only.

## Output Format
Return a structured summary: what you found, the most relevant items,
and any gaps where information was unavailable.
"""

research_agent = Agent(
    name="research-agent",
    instructions=build_dynamic_instructions(RESEARCH_INSTRUCTIONS),
    tools=[search_objects_tool, read_object_tool],  # narrow tool scope
)

# ---------------------------------------------------------------------------
# Sub-agent: Writing Agent
# ---------------------------------------------------------------------------

WRITING_INSTRUCTIONS = """
You are the Writing Agent. You draft professional HR communications.

Scope:
- Draft job postings, candidate summaries, and HR documents.
- Use only the information provided in context — do NOT search for more.
- Do NOT make direct changes — always produce drafts for human review.

## Output Format
Return clean, formatted markdown. Include a "Review checklist" section
at the end with items the human reviewer should verify.
"""

writing_agent = Agent(
    name="writing-agent",
    instructions=build_dynamic_instructions(WRITING_INSTRUCTIONS),
    tools=[],  # writing agent needs no tools — works from context only
)

# ---------------------------------------------------------------------------
# Orchestrator: Manager-as-Tools pattern
# ---------------------------------------------------------------------------

ORCHESTRATOR_INSTRUCTIONS = """
You are the HR Orchestration Agent. You coordinate research and writing tasks.

## Capabilities
- Direct the research agent to gather information.
- Direct the writing agent to produce documents from research output.
- Synthesize final output from both agents.

## Guardrails
DO NOT:
- Perform research or writing yourself — delegate to the specialized agents.
- Chain agent calls in a loop more than 3 times.
- Share data across user or company boundaries.

ALWAYS:
- Pass the full research output as context when calling the writing agent.
- Confirm with the user before creating or submitting any draft.

## Tools
### research_agent (as tool)
Searches for and summarizes HR data.
Use when: you need information before writing.
Do NOT use for: creating or updating records.
Side effects: read-only.

### writing_agent (as tool)
Drafts HR documents from provided context.
Use when: you have research output and need a professional document.
Do NOT use for: searching or fetching data.
Side effects: produces a draft (not published without human review).

## Output Format
Plain prose summary of what was done, followed by the final deliverable
from the writing agent.
"""

orchestrator = Agent(
    name="orchestrator",
    instructions=build_dynamic_instructions(ORCHESTRATOR_INSTRUCTIONS),
    # Sub-agents exposed as tools
    agents_as_tools=[
        research_agent.as_tool(
            tool_name="research_agent",
            tool_description="Find and summarize HR data. Read-only.",
        ),
        writing_agent.as_tool(
            tool_name="writing_agent",
            tool_description="Draft professional HR documents from provided context.",
        ),
    ],
)

# ---------------------------------------------------------------------------
# Execution with session persistence
# ---------------------------------------------------------------------------

session_manager = SessionManager()


async def run_hr_workflow(thread_id: str, user_input: str) -> str:
    session = session_manager.get_session(thread_id)

    result = await Runner.run(
        orchestrator,
        input=user_input,
        session=session,
        context={
            "user_id": user_id,
            "company_id": company_id,
            "thread_id": thread_id,
        },
        max_turns=10,  # safety limit — never remove
    )

    return result.final_output


# ---------------------------------------------------------------------------
# What this pattern demonstrates:
# ---------------------------------------------------------------------------
#
# 1. MANAGER-AS-TOOLS: orchestrator calls agents via tool calls, not handoffs.
#    It retains full context and synthesizes final output.
#
# 2. TOOL SCOPE ISOLATION: research agent sees search/read tools only.
#    Writing agent sees NO tools. Orchestrator sees only agent-as-tool calls.
#
# 3. INSTRUCTION FORWARDING: domain rules ("do NOT share across company
#    boundaries") are in the orchestrator prompt. The orchestrator enforces
#    them when delegating, rather than copying them into each sub-agent.
#
# 4. MAX TURNS: always set. MaxTurnsExceeded returns best partial result.
#
# 5. SESSION PERSISTENCE: SQLiteSession preserves conversation context across
#    multiple API calls within the same thread.
