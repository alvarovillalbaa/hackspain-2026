---
name: databases
description: Use for database schemas, migrations, persistence models, indexing, transactions, normalization, and data-integrity constraints. Child of `backend`.
---

# Database Persistence

This child skill owns database schemas, migrations, persistence models, indexing, transactions, normalization, and data-integrity constraints. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about database schemas, migrations, persistence models, indexing, transactions, normalization, and data-integrity constraints.
- The parent router [`../backend/SKILL.md`](../backend/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `quality-assurance/testing`, `quality-assurance/security`, `quality-assurance`, `code-documentation`, `cloud`, `ai-engineering` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.
- Use "normalization" only for relational schema design. Do not treat payload-shape normalization as a database responsibility.
- Default to no data backfills or compatibility migrations; if live production data makes a hard cut unsafe, stop and ask for an explicit migration decision.

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
