---
name: prompt-engineering
description: Use for system prompts, tool schemas, tool descriptions, constrained generation, and prompt/tool reliability. Child of `ai-engineering`.
---

# Prompt Tool Design

This child skill owns system prompts, tool schemas, tool descriptions, constrained generation, and prompt/tool reliability. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about system prompts, tool schemas, tool descriptions, constrained generation, and prompt/tool reliability.
- The parent router [`../ai-engineering/SKILL.md`](../ai-engineering/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## References

- `references/tool-call-design.md` — tool description templates, naming, side-effect contracts, confirmation flows
- `references/tool-description-auditor.md` — comprehensive XML tool description format: required elements, Pattern A envelope, parameter tiers, golden prompts, severity classification
- `references/system-prompt-architecture.md` — system prompt structure and reliability
- `references/prompt-engineering-patterns.md` — prompting patterns and constrained generation

## Chain Rules

- Chain to `quality-assurance/ai-evals`, `quality-assurance/security`, `backend`, `cloud`, `plugins-management`, `brain` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `browserbase-webmcp-gen`: Generate Web MCP wrappers from browser workflows when toolization is useful. Install: `python3 scripts/install-external-skills.py --skill browserbase-webmcp-gen --agent codex`.
- `browserbase-functions`: Use Browserbase function patterns for reusable browser automation tools. Install: `python3 scripts/install-external-skills.py --skill browserbase-functions --agent codex`.
- `clous-mcp-use`: Use Clous-owned MCP usage guidance for connected tool workflows. Install: `python3 scripts/install-external-skills.py --skill clous-mcp-use --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
