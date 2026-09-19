---
name: agent-system-architecture
description: Use for agent architectures, multi-agent topology, agent lifecycles, handoff patterns, and orchestration contracts. Child of `ai-engineering`.
---

# Agent System Architecture

This child skill owns agent architectures, multi-agent topology, agent lifecycles, handoff patterns, and orchestration contracts. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about agent architectures, multi-agent topology, agent lifecycles, handoff patterns, and orchestration contracts.
- The parent router [`../ai-engineering/SKILL.md`](../ai-engineering/SKILL.md) selects this child.
- The work needs this lane's references, examples, or templates.

## References

- `references/agentic-system-design.md` — agent system design patterns
- `references/agent-analysis.md` — framework for analyzing AI agent implementations: config, architecture, tools, MCP, performance, security, testing, observability
- `references/agent-tool-analysis.md` — systematic analysis of tool definitions, registry/composition, envelopes, and agent wiring

## Chain Rules

- Chain to `quality-assurance/ai-evals`, `quality-assurance/security`, `backend`, `cloud`, `plugins-management`, `brain` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
