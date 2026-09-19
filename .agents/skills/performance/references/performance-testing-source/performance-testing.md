---
name: performance-testing
description: >-
  Use for load tests, latency investigations, profiling, capacity validation,
  and performance regression evidence. Specialist lane of `testing`;
  route here from the parent router when this lane is the narrowest owner.
---

# Performance Testing

This child skill owns load tests, latency investigations, profiling, capacity validation, and performance regression evidence. It carries the detailed assets for this lane after the corrected fragmentation split.

## Use When

- The request is primarily about load tests, latency investigations, profiling, capacity validation, and performance regression evidence.
- The testing router [`../../../testing/SKILL.md`](../../../testing/SKILL.md) selects the relevant verification lane.
- The work needs this lane's references, scripts, examples, or templates.

## Assets

- `references/` contains lane-specific guidance moved from the original parent skill.
- `scripts/` contains executable helpers owned by this lane.
- `templates/` contains reusable output or implementation templates for this lane.
- `examples/` contains sample inputs, outputs, or usage artifacts.

## Chain Rules

- Chain to `pentest`, `ai-engineering/ai-evals-observability`, `frontend`, `backend`, `prs`, `cloud` when the task crosses this child's boundary.
- Use repo-local personalization documents for company, product, voice, cloud, QA, or finance facts instead of hardcoding them here.
- Preserve parent safety and approval rules for destructive, security-sensitive, finance-sensitive, or cloud-costly work.

## Shared Map

See [`../../../../../skills-chaining-map.md`](../../../../../skills-chaining-map.md) for the complete skills-chaining graph.
