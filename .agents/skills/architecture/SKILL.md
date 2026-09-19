---
name: architecture
description: Use for system architecture, technical design, interface decisions, planning, and architecture tradeoff work. Child of `agentic-development`.
---

# Architecture System Design

This child skill owns system architecture, technical design, interface decisions, planning, and architecture tradeoff work. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about system architecture, technical design, interface decisions, planning, and architecture tradeoff work.
- The parent router [`../agentic-development/SKILL.md`](../agentic-development/SKILL.md) selects this child.
- The work needs this lane's references, scripts, examples, or templates.

## References

- `references/architecture-analysis.md` — how to analyze system architecture: entrypoints, path tracing, contracts, dependents
- `references/rearchitecture-execution.md` — 6-phase hard-cut rearchitecture: preparation, directory creation, file migration (always `git mv`), import updates, verification, cleanup
- `references/architecture-patterns.md` — architecture patterns and anti-patterns
- `references/agentic-system-design.md` — agentic architecture patterns

## Chain Rules

- Chain to `frontend`, `backend`, `quality-assurance`, `code-documentation`, `cloud`, `prs`, `plugins-management` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.
- Make specs and plans product-contract first: desired behavior, scope, acceptance, constraints, and proof. Keep technical detail to the minimum needed for a safe handoff.
- Prefer hard-cut owner changes over compatibility shims, facades, route bridges, and data backfills unless the user explicitly chooses a temporary migration path.

## External Skill Chains

Use live external skills when they are installed. If one is missing, report the fallback command instead of copying its guidance inline. Local skill rules, repo-specific facts, safety gates, product/channel constraints, and explicit local exceptions win over external guidance when they conflict.

- `codebase-design`: Use deep-module vocabulary for interface, seam, depth, locality, and testability decisions. Install: `python3 scripts/install-external-skills.py --skill codebase-design --agent codex`.
- `improve-codebase-architecture`: Find deepening opportunities and produce visual architecture-review candidates. Install: `python3 scripts/install-external-skills.py --skill improve-codebase-architecture --agent codex`.
- `grill-with-docs`: Stress-test a plan or design while maintaining docs, ADRs, and glossary context. Install: `python3 scripts/install-external-skills.py --skill grill-with-docs --agent codex`.
- `tdd`: Use external test-first workflow for public-interface behavior changes. Install: `python3 scripts/install-external-skills.py --skill tdd --agent codex`.

Registry: [`../../../references/external-skills.yaml`](../../../references/external-skills.yaml).
Reference-only sources: [`../../../references/external-sources.yaml`](../../../references/external-sources.yaml).

## Shared Map

See [`../../../skills-chaining-map.md`](../../../skills-chaining-map.md) for the complete skills-chaining graph.
