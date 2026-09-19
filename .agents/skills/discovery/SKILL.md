---
name: discovery
description: >-
  Customer discovery, qualitative interviews, theme/pain synthesis, JTBD,
  opportunity mapping, and RICE/ICE/WSJF prioritization. Child of
  `product-development`.
---

# Discovery Prioritization

This child skill owns customer discovery, qualitative research, interviews, theme and pain synthesis, ICP learning, JTBD, opportunity mapping, prioritization, and assumption testing.

## Use When

- The request is primarily about customer discovery, JTBD, opportunity mapping, RICE/ICE/WSJF prioritization, and assumption testing.
- The parent router [`../product-development/SKILL.md`](../product-development/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.
- The work needs account research, prospect enrichment, lead qualification, or evidence-backed product and GTM insight.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

For qualitative research, load `references/customer-research.md`, `references/icp-research.md`, `references/account-research.md`, or `references/prospect-enrichment-and-qualification.md` and reuse the corresponding examples and templates.

## Chain Rules

- Chain to `product-marketing`, `frontend/onboarding-flows`, `quality-assurance/testing`, `reporting`, `go-to-market`, `outreach`, `prospect` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## External Skill Chains

- `last30days`: Use recent-30-days research guidance when freshness matters. Install: `python3 scripts/install-external-skills.py --skill last30days --agent codex`.
- `browserbase-company-research`: Use browser-backed company research for account and market context. Install: `python3 scripts/install-external-skills.py --skill browserbase-company-research --agent codex`.
- `browserbase-search`: Use Browserbase search for web discovery. Install: `python3 scripts/install-external-skills.py --skill browserbase-search --agent codex`.
- `browserbase-fetch`: Use Browserbase fetch for web retrieval. Install: `python3 scripts/install-external-skills.py --skill browserbase-fetch --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
