---
name: backend
description: Router for backend API and persistence work.
---

# Backend Router

## Children

- [`apis`](../apis/SKILL.md) - Apis work.
- [`databases`](../databases/SKILL.md) - Databases work.

## Route

| Request | Use |
| --- | --- |
| apis requests | [`apis`](../apis/SKILL.md) |
| databases requests | [`databases`](../databases/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `quality-assurance/testing`
- `quality-assurance/security`
- `quality-assurance`
- `code-documentation`
- `cloud`
- `ai-engineering`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.
- API and persistence changes should include a proof path and nearby contract docs unless the work is explicitly read-only or trivial.
- Fix canonical payload owners instead of adding backend or frontend compatibility translation layers.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `clous-a2a-integration`: Use Clous-owned A2A integration guidance for agent-to-agent surfaces. Install: `python3 scripts/install-external-skills.py --skill clous-a2a-integration --agent codex`.
- `clous-api-integration`: Use Clous-owned API integration guidance for building or changing platform integrations. Install: `python3 scripts/install-external-skills.py --skill clous-api-integration --agent codex`.
- `clous-api-use`: Use Clous-owned API usage guidance for consuming platform APIs. Install: `python3 scripts/install-external-skills.py --skill clous-api-use --agent codex`.
- `clous-oauth-integration`: Use Clous-owned OAuth integration guidance for auth and consent flows. Install: `python3 scripts/install-external-skills.py --skill clous-oauth-integration --agent codex`.
- `clous-webhook-integration`: Use Clous-owned webhook integration guidance for producer-side webhook work. Install: `python3 scripts/install-external-skills.py --skill clous-webhook-integration --agent codex`.
- `clous-webhook-operations`: Use Clous-owned webhook operations guidance for consumer-side webhook work. Install: `python3 scripts/install-external-skills.py --skill clous-webhook-operations --agent codex`.
- `browserbase-browser-to-api`: Convert browser workflows into API-backed automation when appropriate. Install: `python3 scripts/install-external-skills.py --skill browserbase-browser-to-api --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
