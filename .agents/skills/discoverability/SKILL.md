---
name: discoverability
description: Router for SEO, AEO, GEO, and technical discoverability work.
---

# Discoverability Router

## Children

- [`seo`](../seo/SKILL.md) - Seo And Geo work.
- [`aeo`](../aeo/SKILL.md) - Aeo work.
- [`geo`](../geo/SKILL.md) - Geo work.

## Route

| Request | Use |
| --- | --- |
| seo and geo requests | [`seo`](../seo/SKILL.md) |
| aeo requests | [`aeo`](../aeo/SKILL.md) |
| geo requests | [`geo`](../geo/SKILL.md) |

## Chain Rules

Chain to these skills when the task crosses this skill's boundary:

- `content`
- `product-marketing/cro`
- `frontend/performance`
- `reporting`

## Operating Rules

- Keep this parent compact; use children for lane-specific execution depth.
- Prefer the child skill's bundled resources when a child owns the request.
- Preserve local skill rules, repo facts, safety gates, product/channel constraints, and explicit local exceptions over external guidance when they conflict.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `browserbase-search`: Use Browserbase search guidance for web discovery tasks. Install: `python3 scripts/install-external-skills.py --skill browserbase-search --agent codex`.
- `browserbase-fetch`: Use Browserbase fetch guidance for web retrieval tasks. Install: `python3 scripts/install-external-skills.py --skill browserbase-fetch --agent codex`.
- `browserbase-competitor-analysis`: Use browser-backed competitor analysis workflows for market and SEO comparisons. Install: `python3 scripts/install-external-skills.py --skill browserbase-competitor-analysis --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
