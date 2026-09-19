# Agentic Development — Routing Guide

This skill is the entry point for agentic development work. Use this guide to route requests to the correct child skill.

## Child Skills

| Child | Owns |
|-------|------|
| `agent-harness` | Harness design, dev-loop configuration, session management, CLAUDE.md setup |
| `multi-agent` | Selecting and running a multi-agent architecture (council, pipeline, hierarchical, debate, agentic-graphs, agentic-loops, agentic-goals, blackboard, and other ad-hoc coordination recipes) — chosen per task, not fixed |
| `architecture` | System architecture review, ADRs, tech decisions |
| `cicd` | CI/CD pipeline changes triggered by agentic dev |

## When to Use This Skill Directly

- Evaluating whether a task should be agentic at all.
- Choosing between harness, tool-use, or direct prompting patterns.
- Designing the boundary between human oversight and agent autonomy.

## Routing Decision Tree

```
Is this about building/configuring an agent harness or dev-loop?
  → YES → agent-harness

Is this about designing or running multi-agent systems (orchestrators, sub-agents, councils, pipelines)?
  → YES → multi-agent
  → (pure topology/ADR theory with no execution → `ai-engineering`'s `agent-system-architecture`, a different router's child)

Is this about code architecture (not agent-specific)?
  → YES → architecture

Is this about CI/CD that an agent will run or trigger?
  → YES → cicd

Is this about evaluating/testing agent outputs?
  → YES → ai-evals
```

## Agentic Development Principles

- **Harness-first**: Build the harness before the agent. Define done, define tools, define approval gates.
- **Fail loud**: Agents should surface uncertainty rather than silently choosing wrong paths.
- **Human-in-the-loop by default**: Default to requiring approval for irreversible or high-blast-radius actions.
- **Minimal tool surface**: Give each agent only the tools it needs for its scope.
- **Observability**: Every agent run should produce a trace that answers "what happened and why."
